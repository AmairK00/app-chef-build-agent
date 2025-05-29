const homeDir = require('os').homedir();
const fs = require('fs');
const paramMap = {};

console.log("process argv ", process.argv);
process.argv.forEach(v => {
  if (v.indexOf("=")) {
    if (v.startsWith("--")) {
      v = v.substr(2);
    }
    const splits = v.split("=");
    paramMap[splits[0]] = splits[1];
  }
});

console.log("param map", paramMap);

if (!paramMap['appChef']?.length) {
  throw new Error('At least one AppChef URL is required');
}

if (!paramMap['appChefKey']) {
  throw new Error('appChefKey is missing');
}

if (!paramMap['platforms']) {
  throw new Error("Platforms is not specified");
}

const getWorkspaceDir = (ws) => {
  const workspace = ws || `${homeDir}/.app_chef/`;
  if (!fs.existsSync(workspace)) {
    fs.mkdirSync(workspace, {
      recursive: true
    })
  }
  return workspace;
};

const prepareApp = (args) => {
  const ws = getWorkspaceDir(args['wsDir']);
  fs.readdirSync(ws).filter(f => {
    if (f.endsWith('.lock')) {
      fs.unlinkSync(ws + f);
    }
  });
  const opi = Math.max(args['orderPullInterval'] || 30000);
  return {
    name: args['name'],
    script: __dirname + '/cli.js',
    namespace: args['processGroup'] || 'appchef-agent',
    cwd: ws,
    autorestart: true,
    restart_delay: opi,
    args: [
      "manage",
      `--appChef=${args['appChef']}`,
      `--appChefKey=${args['appChefKey']}`,
      `--platforms=${args['platforms']}`,
      `--kill-timeout=${(args['kill-timeout'] ? args['kill-timeout'] : 40) * 60 * 1000}`,
      `--orderPullInterval=${opi}`
    ],
    instances: (args['instances'] && parseInt(args['instances'])) || 1,
  };
  return
};

const prepareArgs = (tag, paramMap, tagDefaults) => {
  const tagParams = Object.assign({}, paramMap, tagDefaults);
  Object.keys(tagParams).forEach(k => {
    if (k.startsWith(tag)) {
      k.substr(tag.length);
      tagParams[k.substr(tag.length)] = tagParams[k];
    }
  });
  return tagParams;
};

const apps = [];
if (paramMap['platforms'].indexOf('android') >= 0) {
  apps.push(prepareApp(prepareArgs('android-', paramMap, {
    name: 'apk-builder',
    platforms: 'android',
    instances: 1
  })));
}
if (paramMap['platforms'].indexOf('ios') >= 0) {
  apps.push(prepareApp(prepareArgs('ios-', paramMap, {
    name: 'ipa-builder',
    platforms: 'ios',
    instances: 1
  })));
}
//console.log(apps);
module.exports = {
  apps: apps,
  deploy: {
    production: {
      user: 'SSH_USERNAME',
      host: 'SSH_HOSTMACHINE',
      ref: 'origin/master',
      repo: 'GIT_REPOSITORY',
      path: 'DESTINATION_PATH',
      'pre-deploy-local': '',
      'post-deploy': 'npm install && pm2 reload ecosystem.config.js --env production',
      'pre-setup': ''
    }
  }
};