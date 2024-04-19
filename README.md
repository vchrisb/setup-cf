# setup-cf

This action provides the following functionality for GitHub Actions users:

- Installing a version of [Cloud Foundry CLI](https://github.com/cloudfoundry/cli) and (by default) adding it to the PATH
- Requests a Github Actions ID_Token and uses it to login to the Cloud Foundry API using the JWT Bearer Token Grant

## Basic usage

See [action.yml](action.yml)

```yaml
steps:
- uses: actions/checkout@v4
- uses: vchrisb//setup-cf@v0
  with:
    api: https://api.domain.com
    client_id: ${{ secrets.client_id }}
    client_secret: ${{ secrets.client_secret }}
- run: cf push
```

## Parameter

* `client_id`
    * client id for access
    * required
* `client_secret`
    * client secret for access
    * required: true
* `grant_type`
    * grant type for access
    * required
    * default: `jwt-bearer`
* `api`
    * Url of the cloud controller api
    * required
* `version`
    * cf cli v8 version
    * required
    * default: `8.7.10`
* `zone`
    * zone name
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

### update action

```
npm i -g @vercel/ncc
ncc build index.ts
```