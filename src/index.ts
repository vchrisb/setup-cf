const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const fs = require("fs");
const os = require("os");

const cf_config = `${os.homedir()}/.cf/config.json`;

async function install_cf(version) {
  let cachedPath = tc.find("cf", version);
  if (!cachedPath) {
    let download_url = `https://packages.cloudfoundry.org/stable?release=linux64-binary&version=${version}&source=github-rel`;
    let download = await tc.downloadTool(download_url);
    const cfExtractedFolder = await tc.extractTar(download);
    cachedPath = await tc.cacheDir(cfExtractedFolder, "cf", version);
  }
  core.addPath(cachedPath);
}

async function setup_cf(api) {
  await exec.exec("cf", ["api", api], { silent: true });
}

async function request_github_idToken(aud) {
  let id_token = await core.getIDToken(aud);
  return id_token;
}

async function update_cf_token(token) {
  var config = JSON.parse(fs.readFileSync(cf_config));
  config.AccessToken = "bearer " + token.access_token;
  if (config.hasOwnProperty("refresh_token")) {
    config.RefreshToken = token.refresh_token;
  }
  fs.writeFileSync(cf_config, JSON.stringify(config));
}

async function request_token_jwt_bearer(
  uaaEndpoint,
  client_id,
  client_secret,
  id_token,
) {
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

async function request_token_jwt(uaaEndpoint, client_assertion) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const data = new URLSearchParams();
  data.append("client_assertion", client_assertion);
  data.append(
    "client_assertion_type",
    "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
  );
  data.append("grant_type", "client_credentials");

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
    let client_assertion = core.getInput("client_assertion");
    let client_id = core.getInput("client_id");
    let client_secret = core.getInput("client_secret");
    let command = core.getInput("command");
    let id_token = core.getInput("id_token");
    let username = core.getInput("username");
    let password = core.getInput("password");
    let org = core.getInput("org");
    let space = core.getInput("space");
    let version = core.getInput("version", { required: true });
    let zone = core.getInput("zone");
    await install_cf(version);
    core.info(`>>> cf version v${version} installed successfully`);
    await setup_cf(api);
    core.info(">>> Successfully invoked cf api");

    if (grant_type == "jwt-bearer") {
      if (!zone || !client_id || !client_secret) {
        throw new Error(
          `>>> For JWT Bearer Token Grant zone, client_id and client_secret need to be provided`,
        );
      }
      if (!id_token) {
        id_token = await request_github_idToken(zone);
        core.info(">>> Successfully requested github id_token");
      }
      let uaaEndpoint = JSON.parse(fs.readFileSync(cf_config)).UaaEndpoint;
      let token = await request_token_jwt_bearer(
        uaaEndpoint,
        client_id,
        client_secret,
        id_token,
      );
      core.info(
        ">>> Successfully requested uaa token using JWT Bearer Token Grant",
      );
      await update_cf_token(token);
      core.info(">>> Successfully updated token in cf config");
    } else if (grant_type == "private_key_jwt") {
      if (!client_assertion) {
        throw new Error(
          `>>> For Client Credentials Grant using private_key_jwt, client_assertion needs to be provided`,
        );
      }
      let uaaEndpoint = JSON.parse(fs.readFileSync(cf_config)).UaaEndpoint;
      let token = await request_token_jwt(uaaEndpoint, client_assertion);
      core.info(
        ">>> Successfully requested uaa token using Client Credentials Grant with private_key_jwt",
      );
      await update_cf_token(token);
      core.info(">>> Successfully updated token in cf config");
    } else if (grant_type == "client_credentials") {
      if (!client_id || !client_secret) {
        throw new Error(
          `>>> For Client Credentials authentication, client_id and client_secret need to be provided`,
        );
      }
      await exec.exec(
        "cf",
        ["auth", client_id, client_secret, "--client-credentials"],
        { silent: true },
      );
      core.info(">>> Successfully authenticated using client credentials");
    } else if (grant_type == "password") {
      if (!username || !password) {
        throw new Error(
          `>>> For Password authentication, username and password need to be provided`,
        );
      }
      await exec.exec("cf", ["auth", username, password], { silent: true });
      core.info(">>> Successfully authenticated using client credentials");
    } else {
      throw new Error(`>>> Unsupported grant type: ${grant_type}`);
    }
    if (org && space) {
      await exec.exec("cf", ["target", "-o", org, "-s", space]);
      if (command) {
        await exec.exec("cf", command.match(/(?:[^\s"']+|['"][^'"]*["'])+/g));
      }
    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
