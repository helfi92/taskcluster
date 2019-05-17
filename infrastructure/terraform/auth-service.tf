module "auth_user" {
  source = "modules/taskcluster-service-iam-user"
  name   = "taskcluster-auth"
  prefix = "${var.prefix}"

  policy = <<EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "sts:GetFederationToken",
            "Resource": "arn:aws:sts::${data.aws_caller_identity.current.account_id}:federated-user/TemporaryS3ReadWriteCredentials"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:DeleteObject",
                "s3:GetObject",
                "s3:PutObject",
                "s3:PutObjectAcl",
                "s3:ListBucket",
                "s3:GetBucketLocation"
            ],
            "Resource": [
              "${aws_s3_bucket.backups.arn}",
              "${aws_s3_bucket.backups.arn}/*"
            ]
        }
    ]
}
EOF
}

resource "random_string" "auth_table_signing_key" {
  length = 40
}

resource "random_string" "auth_table_crypto_key" {
  length = 32
}

resource "random_string" "auth_root_access_token" {
  length           = 65
  override_special = "_-"
}

resource "random_string" "auth_websocktunnel_secret" {
  length = 66
}

module "auth_rabbitmq_user" {
  source         = "modules/rabbitmq-user"
  prefix         = "${var.prefix}"
  project_name   = "taskcluster-auth"
  rabbitmq_vhost = "${var.rabbitmq_vhost}"
}

locals {
  static_clients = [
    {
      clientId    = "static/taskcluster/web-server"
      accessToken = "${random_string.web_server_access_token.result}"
      description = "..."

      scopes = [
        "assume:mozilla-group:*",
        "assume:mozilla-user:*",
        "assume:mozillians-group:*",
        "assume:mozillians-user:*",
        "auth:create-client:mozilla-auth0/*",
        "auth:delete-client:mozilla-auth0/*",
        "auth:disable-client:mozilla-auth0/*",
        "auth:enable-client:mozilla-auth0/*",
        "auth:reset-access-token:mozilla-auth0/*",
        "auth:update-client:mozilla-auth0/*",
        "assume:login-identity:*",
      ]
    },
    {
      clientId    = "static/taskcluster/secrets"
      accessToken = "${random_string.secrets_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table-access:${azurerm_storage_account.base.name}/Secrets",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Secrets",
      ]
    },
    {
      clientId    = "static/taskcluster/index"
      accessToken = "${random_string.index_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table-access:${azurerm_storage_account.base.name}/IndexedTasks",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/Namespaces",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/IndexedTasks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Namespaces",
        "queue:get-artifact:*",
      ]
    },
    {
      clientId    = "static/taskcluster/worker-manager"
      accessToken = "${random_string.worker_manager_access_token.result}"
      description = "..."

      scopes = [
        "auth:create-client:worker/*",
        "assume:worker-type:worker-manager/*",
        "assume:worker-id:*",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/WM*",
        "notify:email:*",
        "secrets:get:worker-type:*",
        "queue:claim-work:worker-manager/*",
        "queue:worker-id:*",
      ]
    },
    {
      clientId    = "static/taskcluster/github"
      accessToken = "${random_string.github_access_token.result}"
      description = "..."

      scopes = [
        "assume:repo:github.com/*",
        "assume:scheduler-id:taskcluster-github/*",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/TaskclusterGithubBuilds",
        "auth:azure-table-access:${azurerm_storage_account.base.name}/TaskclusterIntegrationOwners",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterGithubBuilds",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterIntegrationOwners",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterChecksToTasks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/TaskclusterCheckRuns",
      ]
    },
    {
      clientId    = "static/taskcluster/hooks"
      accessToken = "${random_string.hooks_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Hooks",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/Queue",
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/LastFire2",
        "assume:hook-id:*",
        "notify:email:*",
        "queue:create-task:*",
      ]
    },
    {
      clientId    = "static/taskcluster/notify"
      accessToken = "${random_string.notify_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/DenylistedNotification",
      ]
    },
    {
      clientId    = "static/taskcluster/purge-cache"
      accessToken = "${random_string.purge_cache_access_token.result}"
      description = "..."

      scopes = [
        "auth:azure-table:read-write:${azurerm_storage_account.base.name}/CachePurges",
      ]
    },
    {
      clientId    = "static/taskcluster/built-in-workers"
      accessToken = "${random_string.built_in_workers_access_token.result}"
      description = "..."

      scopes = [
        "queue:claim-work:built-in/*",
        "assume:worker-id:built-in/*",
        "queue:worker-id:built-in/*",
        "queue:resolve-task",
      ]
    },
    {
      clientId    = "static/taskcluster/queue"
      accessToken = "${random_string.queue_access_token.result}"
      description = "..."

      scopes = ["*"]
    },
    {
      clientId    = "static/taskcluster/root"
      accessToken = "${random_string.auth_root_access_token.result}"
      description = "..."
      scopes      = ["*"]
    },
  ]
}

module "auth_secrets" {
  source            = "modules/service-secrets"
  project_name      = "taskcluster-auth"
  disabled_services = "${var.disabled_services}"

  secrets = {
    AWS_ACCESS_KEY_ID     = "${module.auth_user.access_key_id}"
    AWS_SECRET_ACCESS_KEY = "${module.auth_user.secret_access_key}"
    AWS_REGION            = "${var.aws_region}"
    AZURE_ACCOUNT_KEY     = "${azurerm_storage_account.base.primary_access_key}"
    AZURE_ACCOUNT         = "${azurerm_storage_account.base.name}"

    AZURE_ACCOUNTS = "${jsonencode(map(
      "${azurerm_storage_account.base.name}", "${azurerm_storage_account.base.primary_access_key}",
    ))}"

    STATIC_CLIENTS    = "${jsonencode(local.static_clients)}"
    PULSE_HOSTNAME    = "${var.rabbitmq_hostname}"
    PULSE_VHOST       = "${var.rabbitmq_vhost}"
    PULSE_USERNAME    = "${module.auth_rabbitmq_user.username}"
    PULSE_PASSWORD    = "${module.auth_rabbitmq_user.password}"
    AZURE_CRYPTO_KEY  = "${base64encode(random_string.auth_table_crypto_key.result)}"
    AZURE_SIGNING_KEY = "${random_string.auth_table_signing_key.result}"

    FORCE_SSL            = "false"
    TRUST_PROXY          = "true"
    LOCK_ROLES           = "false"
    NODE_ENV             = "production"
    OWNER_EMAIL          = "bstack@mozilla.com"
    PROFILE              = "production"
    SENTRY_API_KEY       = "TODO SENTRY 4"
    SENTRY_DSN           = "TODO"
    SENTRY_AUTH_TOKEN    = "TODO"
    STATSUM_API_SECRET   = "TODO"
    STATSUM_BASE_URL     = "TODO"
    WEBSOCKTUNNEL_SECRET = "${random_string.auth_websocktunnel_secret.result}"
  }
}

module "auth_web_service" {
  source            = "modules/deployment"
  project_name      = "taskcluster-auth"
  service_name      = "auth"
  proc_name         = "web"
  disabled_services = "${var.disabled_services}"
  readiness_path    = "/api/auth/v1/ping"
  secret_name       = "${module.auth_secrets.secret_name}"
  secrets_hash      = "${module.auth_secrets.secrets_hash}"
  root_url          = "${var.root_url}"
  secret_keys       = "${module.auth_secrets.env_var_keys}"
  docker_image      = "${local.taskcluster_image_monoimage}"
}

module "auth_purge_expired_clients" {
  source           = "modules/scheduled-job"
  project_name     = "taskcluster-auth"
  service_name     = "auth"
  job_name         = "purgeExpiredClients"
  schedule         = "0 0 * * *"
  deadline_seconds = 86400
  secret_name      = "${module.auth_secrets.secret_name}"
  secrets_hash     = "${module.auth_secrets.secrets_hash}"
  root_url         = "${var.root_url}"
  secret_keys      = "${module.auth_secrets.env_var_keys}"
  docker_image     = "${local.taskcluster_image_monoimage}"
}
