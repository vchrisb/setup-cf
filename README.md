# setup-cf

This action provides the following functionality for GitHub Actions users:

- Installing a version of [Cloud Foundry CLI](https://github.com/cloudfoundry/cli) and (by default) adding it to the PATH
- Requests a Github Action ID_Token and uses it to login to the Cloud Foundry API using the JWT Bearer Token Grant

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

## update action

```
npm i -g @vercel/ncc
ncc build index.ts
```