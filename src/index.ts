const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const fs = require("fs").promises;
const os = require("os");
const path = require("path");

// Constants
const CF_CONFIG = path.join(os.homedir(), ".cf", "config.json");
const GRANT_TYPES = {
  JWT_BEARER: "jwt-bearer",
  PRIVATE_KEY_JWT: "private_key_jwt",
  CLIENT_CREDENTIALS: "client_credentials",
  PASSWORD: "password",
};

// Helper functions
async function readConfig() {
  try {
    const configData = await fs.readFile(CF_CONFIG, "utf8");
    return JSON.parse(configData);
  } catch (error) {
    throw new Error(
      `Failed to read CF config: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function install_cf(version) {
  try {
    let cachedPath = tc.find("cf", version);
    if (!cachedPath) {
      const downloadUrl = `https://packages.cloudfoundry.org/stable?release=linux64-binary&version=${version}&source=github-rel`;
      const downloadPath = await tc.downloadTool(downloadUrl);
      const extractedFolder = await tc.extractTar(downloadPath);
      cachedPath = await tc.cacheDir(extractedFolder, "cf", version);
    }
    core.addPath(cachedPath);
    core.info(`>>> CF CLI v${version} installed successfully`);
  } catch (error) {
    throw new Error(
      `Failed to install CF CLI: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function setup_cf(api) {
  try {
    await exec.exec("cf", ["api", api], { silent: true });
    core.info(">>> Successfully set CF API endpoint");
  } catch (error) {
    throw new Error(
      `Failed to set CF API: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function update_cf_token(token) {
  try {
    const config = await readConfig();
    config.AccessToken = `bearer ${token.access_token}`;
    if ("refresh_token" in token && "RefreshToken" in config) {
      config.RefreshToken = token.refresh_token;
    }
    await fs.writeFile(CF_CONFIG, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(
      `Failed to update CF token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
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
  const data = new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: id_token,
  });

  try {
    const response = await fetch(`${uaaEndpoint}/oauth/token`, {
      method: "POST",
      headers,
      body: data,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`UAA token request failed: ${JSON.stringify(errorData)}`);
    }

    return response.json();
  } catch (error) {
    throw new Error(
      `Failed to request JWT bearer token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function request_token_jwt(uaaEndpoint, client_assertion) {
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Accept: "application/json",
  };
  const data = new URLSearchParams({
    client_assertion,
    client_assertion_type:
      "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    grant_type: "client_credentials",
  });

  try {
    const response = await fetch(`${uaaEndpoint}/oauth/token`, {
      method: "POST",
      headers,
      body: data,
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`UAA token request failed: ${JSON.stringify(errorData)}`);
    }

    return response.json();
  } catch (error) {
    throw new Error(
      `Failed to request JWT token: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleJwtBearer(audience, client_id, client_secret, jwt) {
  if (!audience || !client_id || !client_secret) {
    throw new Error(
      "JWT Bearer Token Grant requires audience, client_id and client_secret",
    );
  }

  const actualJwt = jwt || (await core.getIDToken(audience));
  if (!jwt) {
    core.info(">>> Successfully requested GitHub ID token");
  }

  const config = await readConfig();
  const token = await request_token_jwt_bearer(
    config.UaaEndpoint,
    client_id,
    client_secret,
    actualJwt,
  );

  await update_cf_token(token);
  core.info(
    ">>> Successfully obtained and updated UAA token using JWT Bearer Token Grant",
  );
}

async function handlePrivateKeyJwt(jwt) {
  if (!jwt) {
    throw new Error(
      "Client Credentials Grant using private_key_jwt requires jwt",
    );
  }

  const config = await readConfig();
  const token = await request_token_jwt(config.UaaEndpoint, jwt);
  await update_cf_token(token);
  core.info(
    ">>> Successfully obtained and updated UAA token using Client Credentials Grant with private_key_jwt",
  );
}

async function handleClientCredentials(client_id, client_secret) {
  if (!client_id || !client_secret) {
    throw new Error(
      "Client Credentials authentication requires client_id and client_secret",
    );
  }
  await exec.exec(
    "cf",
    ["auth", client_id, client_secret, "--client-credentials"],
    { silent: true },
  );
  core.info(">>> Successfully authenticated using client credentials");
}

async function handlePassword(username, password) {
  if (!username || !password) {
    throw new Error("Password authentication requires username and password");
  }
  await exec.exec("cf", ["auth", username, password], {
    silent: true,
  });
  core.info(">>> Successfully authenticated using password");
}

async function handleOrgSpace(org, space) {
  if (org) {
    if (space) {
      await exec.exec("cf", ["target", "-o", org, "-s", space]);
      core.info(`>>> Successfully targeted org ${org} and space ${space}`);
    } else {
      await exec.exec("cf", ["target", "-o", org]);
      core.info(`>>> Successfully targeted org ${org}`);
    }
  }
}

async function run() {
  try {
    // Input validation
    const inputs = {
      api: core.getInput("api", { required: true }),
      audience: core.getInput("audience"),
      client_id: core.getInput("client_id"),
      client_secret: core.getInput("client_secret"),
      grant_type: core.getInput("grant_type", { required: true }),
      jwt: core.getInput("jwt"),
      org: core.getInput("org"),
      password: core.getInput("password"),
      space: core.getInput("space"),
      username: core.getInput("username"),
      version: core.getInput("version", { required: true }),
    };

    // Setup
    await install_cf(inputs.version);
    await setup_cf(inputs.api);

    // Handle authentication based on grant type
    switch (inputs.grant_type) {
      case GRANT_TYPES.JWT_BEARER:
        await handleJwtBearer(
          inputs.audience,
          inputs.client_id,
          inputs.client_secret,
          inputs.jwt,
        );
        break;

      case GRANT_TYPES.PRIVATE_KEY_JWT:
        await handlePrivateKeyJwt(inputs.jwt);
        break;

      case GRANT_TYPES.CLIENT_CREDENTIALS:
        await handleClientCredentials(inputs.client_id, inputs.client_secret);
        break;

      case GRANT_TYPES.PASSWORD:
        await handlePassword(inputs.username, inputs.password);
        break;

      default:
        throw new Error(`Unsupported grant type: ${inputs.grant_type}`);
    }

    // Target org and space if provided
    await handleOrgSpace(inputs.org, inputs.space);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
  }
}

run();
