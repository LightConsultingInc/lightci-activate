{{/* Name helpers */}}
{{- define "activate.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "activate.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{/* The image tag is the chart's appVersion unless overridden. A different version is refused: the chart and
     the images are released together, and a mismatch is how an upgrade breaks half way (T7.7). Mirrors that
     retag images set global.allowImageTagMismatch. */}}
{{- define "activate.tag" -}}
{{- $tag := default .Chart.AppVersion .Values.global.imageTag -}}
{{- if and .Values.global.imageTag (ne .Values.global.imageTag .Chart.AppVersion) (not .Values.global.allowImageTagMismatch) -}}
{{- fail (printf "global.imageTag %q does not match this chart's appVersion %q. Upgrade the chart and the images together (helm upgrade --version %s), or set global.allowImageTagMismatch=true if your registry retags images." .Values.global.imageTag .Chart.AppVersion .Values.global.imageTag) -}}
{{- end -}}
{{- $tag -}}
{{- end -}}

{{- define "activate.serverImage" -}}
{{- printf "%s/server:%s" .Values.global.imageRegistry (include "activate.tag" .) -}}
{{- end -}}

{{- define "activate.webImage" -}}
{{- printf "%s/web:%s" .Values.global.imageRegistry (include "activate.tag" .) -}}
{{- end -}}

{{- define "activate.labels" -}}
app.kubernetes.io/name: {{ include "activate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ include "activate.tag" . | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "activate.selector" -}}
app.kubernetes.io/name: {{ include "activate.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}

{{/* Common environment for every server container (api, worker, migrate, bootstrap). */}}
{{- define "activate.serverEnv" -}}
- name: ACTIVATE_EDITION
  value: {{ .Values.edition | quote }}
- name: NODE_ENV
  value: production
- name: PORT
  value: "3000"
- name: METRICS_PORT
  value: {{ .Values.metrics.port | quote }}
- name: LOG_LEVEL
  value: {{ .Values.logLevel | quote }}
- name: WEB_URL
  value: {{ printf "https://%s" .Values.global.hosts.web | quote }}
- name: PUBLIC_API_URL
  value: {{ printf "https://%s" .Values.global.hosts.mcp | quote }}
- name: CORS_ORIGINS
  value: {{ printf "https://%s" .Values.global.hosts.web | quote }}
- name: DB_HOST
  value: {{ .Values.database.host | quote }}
- name: DB_PORT
  value: {{ .Values.database.port | quote }}
- name: DB_DATABASE
  value: {{ .Values.database.name | quote }}
- name: DB_USERNAME
  valueFrom: { secretKeyRef: { name: {{ .Values.database.existingSecret | quote }}, key: username } }
- name: DB_PASSWORD
  valueFrom: { secretKeyRef: { name: {{ .Values.database.existingSecret | quote }}, key: password } }
- name: DB_SSL_MODE
  value: {{ .Values.database.sslMode | quote }}
{{- if .Values.database.caBundle.existingConfigMap }}
- name: DB_SSL_CA_FILE
  value: /etc/activate/db-ca/ca.pem
{{- end }}
- name: DB_POOL_MAX
  value: {{ .Values.database.pool.max | quote }}
- name: MIGRATIONS_RUN_ON_BOOT
  value: "false"
- name: ACTIVATE_SECRETS_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.encryption.existingSecret | quote }}, key: key } }
{{- if .Values.encryption.previousExistingSecret }}
- name: ACTIVATE_SECRETS_KEY_PREVIOUS
  valueFrom: { secretKeyRef: { name: {{ .Values.encryption.previousExistingSecret | quote }}, key: previous } }
{{- end }}
{{- if eq .Values.edition "self-hosted" }}
- name: ACTIVATE_LICENSE_FILE
  value: /etc/activate/license/{{ .Values.license.key }}
{{- end }}
- name: ACTIVATE_ORG_NAME
  value: {{ .Values.org.name | quote }}
- name: ACTIVATE_ORG_SLUG
  value: {{ .Values.org.slug | quote }}
- name: ACTIVATE_ORG_EMAIL_DOMAINS
  value: {{ join "," .Values.org.emailDomains | quote }}
- name: ACTIVATE_ORG_INITIAL_ADMINS
  value: {{ join "," .Values.org.initialAdmins | quote }}
- name: ACTIVATE_ORG_SEATS
  value: {{ .Values.org.seats | quote }}
- name: AUTH_PROVIDER
  value: {{ .Values.auth.provider | quote }}
{{- if eq .Values.auth.provider "oidc" }}
- name: AUTH_OIDC_ISSUER
  value: {{ .Values.auth.oidc.issuer | quote }}
- name: AUTH_OIDC_CLIENT_ID
  value: {{ .Values.auth.oidc.clientId | quote }}
{{- if .Values.auth.oidc.existingSecret }}
- name: AUTH_OIDC_CLIENT_SECRET
  valueFrom: { secretKeyRef: { name: {{ .Values.auth.oidc.existingSecret | quote }}, key: client-secret } }
{{- end }}
- name: AUTH_OIDC_SCOPES
  value: {{ .Values.auth.oidc.scopes | quote }}
- name: AUTH_GROUPS_CLAIM
  value: {{ .Values.auth.oidc.groupsClaim | quote }}
{{- else }}
- name: WORKOS_API_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.auth.workos.existingSecret | quote }}, key: api-key } }
- name: WORKOS_CLIENT_ID
  valueFrom: { secretKeyRef: { name: {{ .Values.auth.workos.existingSecret | quote }}, key: client-id } }
{{- end }}
- name: AUTH_ROLE_MAP
  value: {{ .Values.auth.roleMapping | toJson | quote }}
- name: AUTH_PASSWORD_LOGIN
  value: {{ .Values.auth.passwordLogin | quote }}
- name: LEAD_EMAIL_DOMAINS
  value: ""
- name: AI_PROVIDER
  value: live
- name: ANTHROPIC_API_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.ai.anthropic.existingSecret | quote }}, key: api-key } }
- name: ANTHROPIC_MODEL
  value: {{ .Values.ai.model | quote }}
- name: ANTHROPIC_FAST_MODEL
  value: {{ .Values.ai.fastModel | quote }}
{{- if and .Values.ai.voice.enabled .Values.ai.voice.existingSecret }}
- name: OPENAI_API_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.ai.voice.existingSecret | quote }}, key: api-key } }
{{- end }}
{{- if .Values.claudeEnterprise.existingSecret }}
- name: CLAUDE_ANALYTICS_API_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.claudeEnterprise.existingSecret | quote }}, key: analytics-key, optional: true } }
- name: CLAUDE_ADMIN_API_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.claudeEnterprise.existingSecret | quote }}, key: admin-key, optional: true } }
- name: CLAUDE_COMPLIANCE_API_KEY
  valueFrom: { secretKeyRef: { name: {{ .Values.claudeEnterprise.existingSecret | quote }}, key: compliance-key, optional: true } }
- name: ALLOW_PLATFORM_ENTERPRISE_KEYS
  value: "true"
{{- end }}
- name: LIBRARY_PROVIDER
  value: {{ .Values.marketplace.provider | quote }}
- name: LIBRARY_REPOSITORY
  value: {{ .Values.marketplace.repository | quote }}
- name: LIBRARY_REMOTE_URL
  value: {{ .Values.marketplace.remoteUrl | quote }}
- name: LIBRARY_DEFAULT_BRANCH
  value: {{ .Values.marketplace.defaultBranch | quote }}
{{- if and (ne .Values.marketplace.provider "local") .Values.marketplace.existingSecret }}
- name: LIBRARY_GIT_TOKEN
  valueFrom: { secretKeyRef: { name: {{ .Values.marketplace.existingSecret | quote }}, key: token } }
{{- end }}
{{- if eq .Values.marketplace.provider "local" }}
- name: LIBRARY_ALLOW_LOCAL
  value: "true"
{{- end }}
- name: LIBRARY_CLONES_DIR
  value: /data/marketplace-clones
- name: LIBRARY_WORK_DIR
  value: /data/marketplace-work
- name: MCP_APP_HTML
  value: /mcp-app/dist/app.html
- name: WORKER_TIMEZONE
  value: {{ .Values.worker.schedule.timezone | quote }}
- name: TELEMETRY_ENABLED
  value: {{ .Values.telemetry.enabled | quote }}
- name: UPDATE_CHECK_ENABLED
  value: {{ .Values.updates.checkEnabled | quote }}
- name: UPDATE_INDEX_URL
  value: {{ .Values.updates.indexUrl | quote }}
{{- if .Values.networkPolicy.egress.httpsProxy }}
- name: HTTPS_PROXY
  value: {{ .Values.networkPolicy.egress.httpsProxy | quote }}
- name: NO_PROXY
  value: {{ .Values.networkPolicy.egress.noProxy | quote }}
{{- end }}
{{- if .Values.trust.extraCaConfigMap }}
- name: NODE_EXTRA_CA_CERTS
  value: /etc/activate/trust/ca.pem
{{- end }}
{{- with .Values.extraEnv }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{/* Volumes every server container mounts. */}}
{{- define "activate.serverVolumes" -}}
- name: tmp
  emptyDir: {}
{{- if eq .Values.edition "self-hosted" }}
- name: license
  secret:
    secretName: {{ .Values.license.existingSecret | quote }}
{{- end }}
{{- if .Values.database.caBundle.existingConfigMap }}
- name: db-ca
  configMap:
    name: {{ .Values.database.caBundle.existingConfigMap | quote }}
{{- end }}
{{- if .Values.trust.extraCaConfigMap }}
- name: trust
  configMap:
    name: {{ .Values.trust.extraCaConfigMap | quote }}
{{- end }}
{{- end -}}

{{- define "activate.serverVolumeMounts" -}}
- name: tmp
  mountPath: /tmp
{{- if eq .Values.edition "self-hosted" }}
- name: license
  mountPath: /etc/activate/license
  readOnly: true
{{- end }}
{{- if .Values.database.caBundle.existingConfigMap }}
- name: db-ca
  mountPath: /etc/activate/db-ca
  readOnly: true
{{- end }}
{{- if .Values.trust.extraCaConfigMap }}
- name: trust
  mountPath: /etc/activate/trust
  readOnly: true
{{- end }}
{{- end -}}

{{- define "activate.probes" -}}
livenessProbe:
  httpGet: { path: /api/health, port: http }
  initialDelaySeconds: 10
  periodSeconds: 15
readinessProbe:
  httpGet: { path: /api/ready, port: http }
  initialDelaySeconds: 5
  periodSeconds: 10
  failureThreshold: 3
startupProbe:
  httpGet: { path: /api/health, port: http }
  periodSeconds: 5
  failureThreshold: 24
{{- end -}}
