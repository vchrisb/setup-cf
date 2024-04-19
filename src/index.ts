const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const fs = require("fs");
const os = require("os");

const cf_config = `${os.homedir()}/.cf/config.json`;

async function install_cf(version) {
  let cachedPath = tc.find("cf", version);
  if (!cachedPath) {
    let download_url = `https://github.com/cloudfoundry/cli/releases/download/v${version}/cf8-cli_${version}_linux_x86-64.tgz`;
    let download = await tc.downloadTool(download_url);
    const cfExtractedFolder = await tc.extractTar(download);
    cachedPath = await tc.cacheDir(cfExtractedFolder, "cf", version);
  }
  core.addPath(cachedPath);
}

async function setup_cf(api) {
  await exec.exec("cf", ["api", api]);
}

async function request_idToken(aud) {
  let id_token = await core.getIDToken(aud);
  return id_token;
}

async function update_config(token) {
  var config = JSON.parse(fs.readFileSync(cf_config));
  config.AccessToken = "bearer " + token.access_token;
  if (config.hasOwnProperty("refresh_token")) {
    config.RefreshToken = token.refresh_token;
  }
  fs.writeFileSync(cf_config, JSON.stringify(config));
}

async function request_token(uaaEndpoint, client_id, client_secret, id_token) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const data = new URLSearchParams();
  data.append("client_id", client_id);
  data.append("client_secret", client_secret);
  data.append("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer");
  data.append("assertion", id_token);
  return await fetch(`${uaaEndpoint}/oauth/token`, {
    method: "POST",
    headers: headers,
    body: data,
  }).then(async (response) => {
    if (!response.ok) {
      throw new Error(
        `>>> Error requesting token: ${JSON.stringify(await response.json())}`,
      );
    }
    return response.json();
  });
}

async function run() {
  try {
    let api = core.getInput("api", { required: true });
    let grant_type = core.getInput("grant_type", { required: true });
    let client_id = core.getInput("client_id");
    let client_secret = core.getInput("client_secret");
    let version = core.getInput("version", { required: true });
    let zone = core.getInput("zone");
    await install_cf(version);
    core.info(`>>> cf version v${version} installed successfully`);
    await setup_cf(api);
    core.info(">>> Successfully invoked cf api");
    if (grant_type == "jwt-bearer") {
      let id_token = await request_idToken(zone);
      core.info(">>> Successfully requested github id_token");
      let uaaEndpoint = JSON.parse(fs.readFileSync(cf_config)).UaaEndpoint;
      let token = await request_token(
        uaaEndpoint,
        client_id,
        client_secret,
        id_token,
      );
      core.info(">>> Successfully requested uaa token");
      await update_config(token);
      core.info(">>> Successfully update cf config");
    } else {
      throw new Error(`>>> Only jwt-bearer grant type is currently supported`);
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
