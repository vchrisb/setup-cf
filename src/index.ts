const core = require("@actions/core");
const tc = require("@actions/tool-cache");
const exec = require("@actions/exec");
const jsonwebtoken = require("jsonwebtoken");

// Constants
const GRANT_TYPES = {
  JWT_BEARER: "jwt-bearer",
  CLIENT_CREDENTIALS: "client_credentials",
  PASSWORD: "password",
};

// Helper functions
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

async function setup_cf(api, skip_ssl_validation) {
  try {
    if (skip_ssl_validation === true) {
      await exec.exec("cf", ["api", api, "--skip-ssl-validation"], {
        silent: false,
      });
    } else {
      await exec.exec("cf", ["api", api], { silent: false });
    }
    core.info(">>> Successfully set CF API endpoint");
  } catch (error) {
    throw new Error(
      `Failed to set CF API: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

async function handleJwtBearer(
  audience,
  client_id,
  client_secret,
  jwt,
  origin,
) {
  if (!jwt) {
    core.info(">>> Requesting GitHub ID token");
    if (!audience) {
      core.info(">>> Setting audience to default: uaa");
      audience = "uaa";
    }
    jwt = await core.getIDToken(audience || undefined);
  }

  // Build command arguments array
  const args = ["auth"];

  // Add client_id only if passed
  if (client_id) {
    args.push(client_id);

    // Add client_secret only if both client_id and client_secret are passed
    if (client_secret) {
      args.push(client_secret);
    }
  }

  // Add assertion parameter and JWT token
  args.push("--assertion", jwt);

  // Add origin only if passed
  if (origin) {
    args.push("--origin", origin);
  }

  // Execute command with constructed arguments
  await exec.exec("cf", args, { silent: false });

  core.info(">>> Successfully authenticated using JWT Bearer Token Grant");
}

async function handleClientCredentialsJwt(audience, client_id, jwt) {
  if (!jwt) {
    core.info(">>> Requesting GitHub ID token");
    jwt = await core.getIDToken(audience || undefined);
  }

  await exec.exec(
    "cf",
    ["auth", client_id, "--client-credentials", "--assertion", jwt],
    { silent: false },
  );
  core.info(">>> Successfully authenticated using client credentials with JWT");
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
    { silent: false },
  );
  core.info(">>> Successfully authenticated using client credentials");
}

async function handlePassword(username, password, origin) {
  if (!username || !password) {
    throw new Error("Password authentication requires username and password");
  }

  // Build command arguments array
  const args = ["auth", username, password];

  // Add origin only if passed
  if (origin) {
    args.push("--origin", origin);
  }

  // Execute command with constructed arguments
  await exec.exec("cf", args, { silent: false });
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
      origin: core.getInput("origin"),
      password: core.getInput("password"),
      skip_ssl_validation:
        core.getInput("skip_ssl_validation").toLowerCase() === "true",
      space: core.getInput("space"),
      username: core.getInput("username"),
      version: core.getInput("version", { required: true }),
    };

    // Setup
    await install_cf(inputs.version);
    await setup_cf(inputs.api, inputs.skip_ssl_validation);

    // Validate jwt if present
    if (inputs.jwt) {
      const decoded = jsonwebtoken.decode(inputs.jwt, { complete: true });

      // Check if it has the expected JWT structure
      if (decoded === null || !decoded.header || !decoded.payload) {
        throw new Error("Input for Client Credential authentication failed!");
      }
    }

    // Handle authentication based on grant type
    switch (inputs.grant_type) {
      case GRANT_TYPES.JWT_BEARER:
        await handleJwtBearer(
          inputs.audience,
          inputs.client_id,
          inputs.client_secret,
          inputs.jwt,
          inputs.origin,
        );
        break;

      case GRANT_TYPES.CLIENT_CREDENTIALS:
        if (inputs.client_id && inputs.client_secret) {
          await handleClientCredentials(inputs.client_id, inputs.client_secret);
        } else if (inputs.client_id && !inputs.client_secret) {
          await handleClientCredentialsJwt(
            inputs.audience,
            inputs.client_id,
            inputs.jwt,
          );
        } else {
          throw new Error("Input for Client Credential authentication failed!");
        }
        break;

      case GRANT_TYPES.PASSWORD:
        await handlePassword(inputs.username, inputs.password, inputs.origin);
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
