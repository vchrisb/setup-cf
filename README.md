# setup-cf

This action provides the following functionality for GitHub Actions users:

- Installing a version of [Cloud Foundry CLI](https://github.com/cloudfoundry/cli) and adding it to the PATH
- Authenticating to the Cloud Foundry API using different grant types:
  - Password
  - Client Credentials
  - Client Credentials with JWT
  - JWT Bearer Token Grant
- Target Org and Space

## Basic usage

See [action.yml](action.yml)

```yaml
steps:
- uses: actions/checkout@v4
- uses: vchrisb/setup-cf@v2
  with:
    api: ${{ secrets.CF_API }}
    username: ${{ secrets.CF_USERNAME }}
    password: ${{ secrets.CF_PASSWORD }}
    org: test
    space: dev
- name: run cf command
  run: cf apps
```

## Parameter
* `api`
    * Url of the cloud controller api
    * required
* `audience`
    * audience for requesting the GitHub `id_token`
* `client_id`
    * client id for `client_credentals` or `jwt-bearer`
* `client_secret`
    * client secret for `client_credentals` or `jwt-bearer`
* `grant_type`
    * grant type for access
    * required
    * default: `password`
    * valid values:
        * `password`
        * `client_credentals`
        * `jwt-bearer`
* `jwt`
    * jwt for usage with `client_credentals` or `jwt-bearer`. If omitted, a GitHub `id_token` will be requested
* `org`
    * Cloud Foundry organization name
* `origin`
    * Origin to be used for authentication with `jwt-bearer` or `password`
* `username`
    * username for `password` grant
* `password`
    * password for `password` grant
* `skip_ssl_validation`
    * Skip verification of the API endpoint
    * default: `false`
* `space`
    * Cloud Foundry space name
* `version`
    * cf cli version
    * required
    * default: `8.12.0`

## Advanced

Requires at least UAA `77.20.4`.

### GitHub id_token

https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect

To allow a workflow to request an `id_token`, the workflow needs to have the correct permissions:

```
permissions:
  id-token: write # This is required for requesting the JWT
  contents: read  # This is required for actions/checkout
```

> The `sub` may not be used for the `user_name` attribute mapping, as it can include unsupported characters like `/`  and `:`. 

The sub can be customized https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect#customizing-the-subject-claims-for-an-organization-or-repository

### setup UAA for JWT Bearer Token Grant with GitHub

Add the GitHub OIDC provider and use e.g. the `repository_owner` claim as the `user_name`:

```
uaac curl /identity-providers -X POST -H "Content-Type: application/json" -d '{"type": "oidc1.0", "name": "GitHub", "originKey": "github", "config": {"discoveryUrl": "https://token.actions.githubusercontent.com/.well-known/openid-configuration", "scopes": ["read:user", "user:email"], "linkText": "Login with GitHub", "showLinkText": false, "addShadowUserOnLogin": true, "clientAuthInBody": true, "relyingPartyId": "uaa", "addShadowUserOnLogin": true, "attributeMappings" : {"given_name": "repository_owner", "family_name": "repository_owner_id", "user_name": "repository_owner"}}}'
```

The UAA client used does need to include `urn:ietf:params:oauth:grant-type:jwt-bearer` in the `authorized_grant_types`.
This can be the default `cf` client, but also a dedicated one:

```
uaac curl /oauth/clients -X POST -H "Content-Type: application/json" -d '{"client_id" : "jwt-bearer-client", "access_token_validity": 1800,  "authorities" : [ "uaa.resource" ], "authorized_grant_types" : [ "urn:ietf:params:oauth:grant-type:jwt-bearer" ], "scope": ["openid", "cloud_controller.read"], "allowedproviders" : [ "github" ], "name" : "JWT Bearer Client"}'
```

```yaml
name: Jwt Bearer Flow using GitHub id_token
on: [push]
permissions:
  id-token: write
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: vchrisb/setup-cf@v2
    with:
        api: ${{ secrets.CF_API }}
        grant_type: jwt-bearer
        org: test
        space: dev
    - name: run cf command
    run: cf apps
```

The cf cli will be authenticated as an user, which username is defined by the `attributeMappings`.

### setup UAA for JWT client credentials

The UAA client used does need to include `client_credentials` in the `authorized_grant_types`.

```
uaac client add setup-cf --scope uaa.none --authorities cloud_controller.read,cloud_controller.write,clients.read --authorized_grant_type "client_credentials"
```

Add the jwt configuration to the client.
The following example is for GitHub. You can also pass a different token using `jwt` parameter, but will need to adapt the configuration to your idp.
```
uaac client jwt add setup-cf --issuer https://token.actions.githubusercontent.com --subject repo:vchrisb/setup-cf:environment:Production  --aud https://github.com/vchrisb
```

```yaml
name: Client Credentials using GitHub id_token
on: [push]
permissions:
  id-token: write
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - uses: vchrisb/setup-cf@v2
    with:
        api: ${{ secrets.CF_API }}
        client_id: setup-cf
        grant_type: client_credentials
        org: test
        space: dev
    - name: run cf command
    run: cf apps
```

The cf cli will be authenticated as the client `setup-cf`.

## Developmet

### update action

```
npm i -g @vercel/ncc
npm run format
npm run build
```
