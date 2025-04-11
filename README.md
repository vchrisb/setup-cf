# setup-cf

## Overview

The `setup-cf` GitHub Action enables seamless integration with Cloud Foundry in your CI/CD pipelines. It simplifies the process of installing the Cloud Foundry CLI (cf cli), authenticating with Cloud Foundry services, and targeting specific organizations and spaces.

This action is particularly useful for teams who deploy applications to Cloud Foundry platforms and want to automate their deployment workflows.

## Features

- **Installation**: Automatically installs a specified version of [Cloud Foundry CLI](https://github.com/cloudfoundry/cli) and adds it to the PATH
- **Authentication**: Supports multiple authentication grant types:
  - Password
  - Client Credentials
  - Client Credentials with JWT
  - JWT Bearer Token Grant
- **Targeting**: Automatically targets specified organization and space
- **GitHub OIDC Integration**: Works with GitHub's OpenID Connect (OIDC) for secure authentication

## Basic Usage

See [action.yml](action.yml) for complete action definition.

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

## Parameters

| Parameter | Description | Required | Default | 
|-----------|-------------|:--------:|:-------:|
| `api` | URL of the Cloud Foundry API endpoint | Yes | - |
| `audience` | Audience for requesting the GitHub `id_token` | No | - |
| `client_id` | Client ID for `client_credentials` or `jwt-bearer` grant types | No | - |
| `client_secret` | Client secret for `client_credentials` or `jwt-bearer` grant types | No | - |
| `grant_type` | Authentication grant type (`password`, `client_credentials`, or `jwt-bearer`) | Yes | `password` |
| `jwt` | JWT token for use with `client_credentials` or `jwt-bearer`. If omitted with these grant types, a GitHub `id_token` will be requested automatically | No | - |
| `org` | Cloud Foundry organization name to target | No | - |
| `origin` | Identity provider origin to use for authentication with `jwt-bearer` or `password` | No | - |
| `username` | Username for `password` grant type | No | - |
| `password` | Password for `password` grant type | No | - |
| `skip_ssl_validation` | Skip verification of the API endpoint (not recommended for production) | No | `false` |
| `space` | Cloud Foundry space name to target | No | - |
| `version` | Cloud Foundry CLI version to install | Yes | `8.12.0` |

## Authentication Methods

### Password Authentication

The simplest authentication method using username and password:

```yaml
- uses: vchrisb/setup-cf@v2
  with:
    api: ${{ secrets.CF_API }}
    grant_type: password
    username: ${{ secrets.CF_USERNAME }}
    password: ${{ secrets.CF_PASSWORD }}
    org: myorg
    space: myspace
```

### JWT Bearer Token Grant with GitHub OIDC

This method leverages GitHub's OIDC provider for secure, token-based authentication:

```yaml
name: JWT Bearer Flow using GitHub id_token
on: [push]
permissions:
  id-token: write  # Required for requesting the JWT
  contents: read   # Required for actions/checkout
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

### Client Credentials with JWT

This method uses client credentials with JWT verification:

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

## Advanced Configuration

### Setting up UAA for GitHub Authentication

#### Prerequisites
- UAA version 77.20.4 or higher
- Administrative access to UAA

#### Configuring UAA for JWT Bearer Token Grant with GitHub

1. Add the GitHub OIDC provider to UAA:

```
uaac curl /identity-providers -X POST -H "Content-Type: application/json" -d '{
  "type": "oidc1.0", 
  "name": "GitHub", 
  "originKey": "github", 
  "config": {
    "discoveryUrl": "https://token.actions.githubusercontent.com/.well-known/openid-configuration", 
    "scopes": ["read:user", "user:email"], 
    "linkText": "Login with GitHub", 
    "showLinkText": false, 
    "addShadowUserOnLogin": false, 
    "clientAuthInBody": true, 
    "relyingPartyId": "uaa", 
    "addShadowUserOnLogin": true, 
    "attributeMappings": {
      "given_name": "repository_owner", 
      "family_name": "repository_owner_id", 
      "user_name": "repository_owner"
    }
  }
}'
```

2. Ensure your UAA client includes the JWT bearer grant type:

Either create a dedicated client to be used for JWT bearer grant: 

```
uaac curl /oauth/clients -X POST -H "Content-Type: application/json" -d '{
  "client_id": "jwt-bearer-client", 
  "access_token_validity": 1800,  
  "authorities": ["uaa.resource"], 
  "authorized_grant_types": ["urn:ietf:params:oauth:grant-type:jwt-bearer"], 
  "scope": ["openid", "cloud_controller.read"], 
  "allowedproviders": ["github"], 
  "name": "JWT Bearer Client"
}'
```

Or add the grant type to the default `cf` client:

```
uaac client update cf \
  --authorized_grant_types refresh_token,password,urn:ietf:params:oauth:grant-type:jwt-bearer
```

#### Configuring UAA for JWT Client Credentials

1. Create a client with client credentials grant type:

```
uaac client add setup-cf \
  --scope uaa.none \
  --authorities cloud_controller.read,cloud_controller.write,clients.read \
  --authorized_grant_type "client_credentials"
```

2. Add JWT configuration to the client:

```
uaac client jwt add setup-cf \
  --issuer https://token.actions.githubusercontent.com \
  --subject repo:vchrisb/setup-cf:environment:Production \
  --aud https://github.com/vchrisb
```

Subject and Audience need to adapted to your repo and workflow.

### GitHub OIDC Configuration

To use GitHub's OIDC provider, your workflow must have the appropriate permissions:

```yaml
permissions:
  id-token: write  # Required for requesting the JWT
  contents: read   # Required for actions/checkout
```

Note: The `sub` claim from GitHub may contain characters like `/` and `:` which are not supported for the `user_name` attribute. Consider using alternative claims or customizing the subject as described in [GitHub's documentation](https://docs.github.com/en/actions/security-for-github-actions/security-hardening-your-deployments/about-security-hardening-with-openid-connect#customizing-the-subject-claims-for-an-organization-or-repository).

## Troubleshooting

### Common Issues

1. **Authentication Failures**
   - Verify your credentials are correct
   - Check that your client has the necessary authorities and grant types
   - Ensure the UAA version is 77.20.4 or higher for JWT-based auth

2. **Permission Issues**
   - For GitHub OIDC, make sure the workflow has `id-token: write` permission
   - Verify the client or user has appropriate Cloud Foundry permissions

3. **Targeting Issues**
   - Confirm the organization and space exist
   - Check that the authenticated user/client has access to the specified org/space

### Debugging

Add the following to your workflow to see more detailed output:

```yaml
env:
  CF_LOG_LEVEL: DEBUG
```

## Development

To update the action:

```
npm i -g @vercel/ncc
npm run format
npm run build
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.