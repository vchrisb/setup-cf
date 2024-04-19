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
- uses: vchrisb/setup-cf@v0
  with:
    api: ${{ secrets.CF_API }}
    username: ${{ secrets.CF_USERNAME }}
    password: ${{ secrets.CF_PASSWORD }}
    org: test
    space: dev
- run: cf push
```

## Parameter
* `api`
    * Url of the cloud controller api
    * required
* `client_assertion`
    * jwt for usage with `private_key_jwt`
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
        * `private_key_jwt`
        * `jwt-bearer`
* `id_token`
    * id_token to be used for `jwt-bearer`, if not specified a Github id_token will be requested
* `username`
    * username for `password` grant
* `password`
    * password for `password` 
* `org`
    * organization name
* `space`
    * space name
* `version`
    * cf cli version
    * required
    * default: `8.7.10`
* `zone`
    * zone name used for audience in the JWT Bearer Token Grant
    * required
    * default: `uaa`

## Advanced

### setup UAA for JWT Bearer Token Grant

Add the Github OIDC provider using non existing credentials and use e.g. the `repository_owner` claimm as the `user_name`:

```
uaa curl /identity-providers -X POST -H "Content-Type: application/json" -d '{"type": "oidc1.0", "name": "Github", "originKey": "github", "config": {"discoveryUrl": "https://token.actions.githubusercontent.com/.well-known/openid-configuration", "scopes": ["read:user", "user:email"], "linkText": "Login with Github", "showLinkText": false, "addShadowUserOnLogin": true, "clientAuthInBody": true, "relyingPartyId": "uaa", "relyingPartySecret": "uaa", "addShadowUserOnLogin": true, "attributeMappings" : {"given_name": "repository_owner", "family_name": "repository_owner_id", "user_name": "repository_owner"}}}'
```

> The `sub` can't be used for the `user_name`, as it includes unsupported characters like `/`  and `:`.

UAA client required for authentication:
```
uaa curl /oauth/clients -X POST -H "Content-Type: application/json" -d '{"client_id" : "jwt-bearer-client", "client_secret" : "secret", "access_token_validity": 1800,  "authorities" : [ "uaa.resource" ], "authorized_grant_types" : [ "urn:ietf:params:oauth:grant-type:jwt-bearer" ], "scope": ["openid", "cloud_controller.read"], "allowedproviders" : [ "github" ], "name" : "JWT Bearer Client"}'
```

## Developmet

### update action

```
npm i -g @vercel/ncc
npm run lint
npm run build
```