#!/usr/bin/env bash
# Install, upgrade and roll back the Helm chart on a kind cluster the way a customer would (T4.4, T7.4, T7.5):
# TLS Postgres verified through database.caBundle, Keycloak over https signed by a private CA that the
# API trusts through trust.extraCaConfigMap, a real licence, first-boot bootstrap, doctor, metrics, web.
#
#   LICENSE_PRIVATE_KEY_FILE=~/lightci-license-private.jwk.json scripts/ci/kind-smoke.sh
#
# Env: KIND_CLUSTER (activate), IMAGE_TAG (smoke), SKIP_BUILD=1 to reuse local images, KEEP=1 to leave
# the release installed, ANTHROPIC_API_KEY (optional; without it doctor's anthropic check is allowed to fail),
# LICENSE_SIGNING_KEY (the private JWK as a string; CI) instead of LICENSE_PRIVATE_KEY_FILE.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CLUSTER="${KIND_CLUSTER:-activate}"
NS=activate
TAG="${IMAGE_TAG:-smoke}"
REG=ghcr.io/lightconsultinginc/activate
WORK="$(mktemp -d)"
KEY_FILE="${LICENSE_PRIVATE_KEY_FILE:-}"
if [[ -z "$KEY_FILE" && -n "${LICENSE_SIGNING_KEY:-}" ]]; then
  KEY_FILE="$WORK/license.jwk.json"; printf '%s' "$LICENSE_SIGNING_KEY" > "$KEY_FILE"
fi
[[ -n "$KEY_FILE" ]] || { echo "LICENSE_PRIVATE_KEY_FILE or LICENSE_SIGNING_KEY is required (a licence is part of a real install)" >&2; exit 2; }
PF_PIDS=()
cleanup() {
  for p in "${PF_PIDS[@]:-}"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null || true; done
  if [[ "${KEEP:-0}" != "1" ]]; then helm -n $NS uninstall activate >/dev/null 2>&1 || true; kubectl delete ns $NS --wait=false >/dev/null 2>&1 || true; fi
  rm -rf "$WORK"
}
trap cleanup EXIT
step() { printf '\n==> %s\n' "$*"; }
fail() { echo "SMOKE FAILED: $*" >&2; exit 1; }

step "kind cluster $CLUSTER"
kind get clusters | grep -qx "$CLUSTER" || kind create cluster --name "$CLUSTER" --wait 120s
kubectl config use-context "kind-$CLUSTER" >/dev/null

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  step "build images (release server image with the demo marketplace, web)"
  docker build -f "$ROOT/api/Dockerfile" --build-arg DEMO_MARKETPLACE=1 -t "$REG/server:$TAG" "$ROOT"
  docker build -t "$REG/web:$TAG" "$ROOT/frontend"
fi
step "load images into kind"
kind load docker-image --name "$CLUSTER" "$REG/server:$TAG" "$REG/web:$TAG"

step "namespace, private CA and certificates"
kubectl create ns $NS --dry-run=client -o yaml | kubectl apply -f - >/dev/null
if kubectl -n $NS get configmap smoke-ca >/dev/null 2>&1; then
  echo "reusing the CA, certificates and secrets of the existing install (KEEP=1 run)"
else
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -days 2 \
  -subj "/CN=activate-smoke-ca" -addext "basicConstraints=critical,CA:TRUE" -addext "keyUsage=critical,keyCertSign,cRLSign" \
  -keyout "$WORK/ca.key" -out "$WORK/ca.pem" 2>/dev/null
issue() { # name host
  openssl req -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 -nodes -subj "/CN=$2" -keyout "$WORK/$1.key" -out "$WORK/$1.csr" 2>/dev/null
  printf 'subjectAltName=DNS:%s,DNS:%s\nextendedKeyUsage=serverAuth\n' "$2" "$1" > "$WORK/$1.ext"
  openssl x509 -req -in "$WORK/$1.csr" -CA "$WORK/ca.pem" -CAkey "$WORK/ca.key" -CAcreateserial -days 2 -out "$WORK/$1.crt" -extfile "$WORK/$1.ext" 2>/dev/null
}
issue postgres "postgres.$NS.svc.cluster.local"
issue keycloak "keycloak.$NS.svc.cluster.local"
kubectl -n $NS create secret tls postgres-tls --cert "$WORK/postgres.crt" --key "$WORK/postgres.key" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n $NS create secret tls keycloak-tls --cert "$WORK/keycloak.crt" --key "$WORK/keycloak.key" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n $NS create configmap smoke-ca --from-file=ca.pem="$WORK/ca.pem" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n $NS create configmap keycloak-realm --from-file=realm.json="$ROOT/api/test/keycloak/realm-activate-test.json" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n $NS create secret generic activate-db --from-literal=username=activate --from-literal=password=smoke-password >/dev/null
kubectl -n $NS create secret generic activate-encryption --from-literal=key="$(openssl rand -base64 32)" >/dev/null
kubectl -n $NS create secret generic activate-oidc --from-literal=client-secret=activate-secret >/dev/null
fi

step "the customer's dependencies: TLS Postgres and Keycloak over https"
kubectl -n $NS apply -f - >/dev/null <<YAML
apiVersion: apps/v1
kind: Deployment
metadata: { name: postgres }
spec:
  replicas: 1
  selector: { matchLabels: { app: postgres } }
  template:
    metadata: { labels: { app: postgres } }
    spec:
      securityContext: { fsGroup: 999 }
      containers:
        - name: postgres
          image: postgres:16
          args: ["-c", "ssl=on", "-c", "ssl_cert_file=/certs/tls.crt", "-c", "ssl_key_file=/certs/tls.key"]
          env:
            - { name: POSTGRES_USER, value: activate }
            - { name: POSTGRES_PASSWORD, value: smoke-password }
            - { name: POSTGRES_DB, value: activate }
          ports: [{ containerPort: 5432 }]
          readinessProbe: { exec: { command: [pg_isready, -U, activate] }, periodSeconds: 3 }
          volumeMounts: [{ name: certs, mountPath: /certs, readOnly: true }]
      volumes:
        - name: certs
          secret: { secretName: postgres-tls, defaultMode: 0440 }
---
apiVersion: v1
kind: Service
metadata: { name: postgres }
spec: { selector: { app: postgres }, ports: [{ port: 5432, targetPort: 5432 }] }
---
apiVersion: apps/v1
kind: Deployment
metadata: { name: keycloak }
spec:
  replicas: 1
  selector: { matchLabels: { app: keycloak } }
  template:
    metadata: { labels: { app: keycloak } }
    spec:
      containers:
        - name: keycloak
          image: quay.io/keycloak/keycloak:26.0
          args: ["start-dev", "--import-realm", "--https-certificate-file=/certs/tls.crt", "--https-certificate-key-file=/certs/tls.key", "--hostname-strict=false"]
          env:
            - { name: KC_BOOTSTRAP_ADMIN_USERNAME, value: admin }
            - { name: KC_BOOTSTRAP_ADMIN_PASSWORD, value: admin }
          ports: [{ containerPort: 8443 }]
          readinessProbe:
            httpGet: { path: /realms/activate-test, port: 8443, scheme: HTTPS }
            periodSeconds: 5
            failureThreshold: 60
          volumeMounts:
            - { name: certs, mountPath: /certs, readOnly: true }
            - { name: realm, mountPath: /opt/keycloak/data/import, readOnly: true }
      volumes:
        - { name: certs, secret: { secretName: keycloak-tls } }
        - { name: realm, configMap: { name: keycloak-realm } }
---
apiVersion: v1
kind: Service
metadata: { name: keycloak }
spec: { selector: { app: keycloak }, ports: [{ port: 443, targetPort: 8443 }] }
YAML
kubectl -n $NS rollout status deploy/postgres --timeout=180s >/dev/null
kubectl -n $NS rollout status deploy/keycloak --timeout=420s >/dev/null

step "the customer's secrets and licence"
EXPIRES=$(date -u -v+1y +%F 2>/dev/null || date -u -d '+1 year' +%F)
(cd "$ROOT" && LICENSE_PRIVATE_KEY_FILE="$KEY_FILE" node scripts/license-issue.mjs --org "Acme Corp" --slug acme --seats 50 --expires "$EXPIRES" > "$WORK/license.jwt")
kubectl -n $NS create secret generic activate-license --from-file=license.jwt="$WORK/license.jwt" --dry-run=client -o yaml | kubectl apply -f - >/dev/null
kubectl -n $NS create secret generic activate-anthropic --from-literal=api-key="${ANTHROPIC_API_KEY:-sk-ant-not-a-real-key}" --dry-run=client -o yaml | kubectl apply -f - >/dev/null

cat > "$WORK/values.yaml" <<YAML
global:
  imageTag: "$TAG"
  allowImageTagMismatch: true # locally built images carry the tag "smoke"
  hosts: { web: activate.smoke.test, api: api.activate.smoke.test, mcp: mcp.activate.smoke.test }
org: { name: Acme Corp, slug: acme, emailDomains: [acme.test], initialAdmins: [jane.doe@acme.test], seats: 50 }
auth:
  oidc:
    issuer: https://keycloak.$NS.svc.cluster.local/realms/activate-test
    clientId: activate
    existingSecret: activate-oidc
database:
  host: postgres.$NS.svc.cluster.local
  name: activate
  existingSecret: activate-db
  sslMode: verify-full
  caBundle: { existingConfigMap: smoke-ca }
trust: { extraCaConfigMap: smoke-ca }
marketplace: { provider: local, persistence: { enabled: true, size: 1Gi } }
ingress: { internal: { enabled: false }, mcp: { enabled: false } }
# The IdP's pods listen on 8443 behind a Service on 443; network policies see the pod port after NAT.
networkPolicy: { extraEgressPorts: [8443] }
podDisruptionBudget: { enabled: false }
web: { replicas: 1, autoscaling: { enabled: false }, resources: { requests: { cpu: 50m, memory: 128Mi }, limits: { cpu: 500m, memory: 512Mi } } }
api: { replicas: 1, autoscaling: { enabled: false }, resources: { requests: { cpu: 100m, memory: 256Mi }, limits: { cpu: "1", memory: 1Gi } } }
worker: { resources: { requests: { cpu: 100m, memory: 256Mi }, limits: { cpu: "1", memory: 1Gi } } }
YAML

step "helm install (migrate hook, pods, bootstrap hook)"
helm upgrade --install activate "$ROOT/deploy/helm/activate" -n $NS -f "$WORK/values.yaml" --wait --timeout 15m
kubectl -n $NS get pods

forward() { # svc port -> local port; echoes nothing, records pid
  kubectl -n $NS port-forward "svc/$1" "$2:$3" >/dev/null 2>&1 &
  PF_PIDS+=("$!")
  for _ in $(seq 1 30); do curl -s -o /dev/null "http://127.0.0.1:$2/" && return 0; sleep 1; done
  return 0
}

step "API readiness and OAuth discovery through the service"
forward activate-api 13000 3000
curl -fsS http://127.0.0.1:13000/api/ready >/dev/null || fail "/api/ready not 200"
curl -fsS http://127.0.0.1:13000/.well-known/oauth-authorization-server | grep -q '"authorization_endpoint"' || fail "OAuth discovery document missing"

step "activate doctor inside the api pod"
set +e
DOCTOR=$(kubectl -n $NS exec deploy/activate-api -- activate doctor 2>&1); DOCTOR_EXIT=$?
set -e
echo "$DOCTOR"
for name in database license identity; do
  echo "$DOCTOR" | grep -Eq "^✓ ${name} " || fail "doctor: ${name} is not ✓"
done
echo "$DOCTOR" | grep -Eq "^(✓|!) marketplace " || fail "doctor: marketplace failed"
echo "$DOCTOR" | grep -Eq "^(✓|!) jobs " || fail "doctor: jobs failed"
if [[ -n "${ANTHROPIC_API_KEY:-}" ]]; then
  [[ $DOCTOR_EXIT -eq 0 ]] || fail "doctor exited $DOCTOR_EXIT with a real Anthropic key"
else
  # Without a key only the anthropic check may fail.
  [[ $(echo "$DOCTOR" | grep -c '^✗') -le 1 ]] && ! echo "$DOCTOR" | grep -E '^✗' | grep -vq anthropic || fail "doctor reported failures other than anthropic"
fi

step "metrics on the api and the worker, on their own port"
forward activate-api 19464 9464
curl -fsS http://127.0.0.1:19464/metrics > "$WORK/api-metrics.txt" || fail "api /metrics unreachable"
grep -q '^activate_license_seats 50$' "$WORK/api-metrics.txt" || fail "licence seats not exported"
# A fresh install has no people yet: initial admins become seats at their first sign-in, so 0 is correct here.
grep -Eq '^activate_license_seats_used [0-9]+$' "$WORK/api-metrics.txt" || fail "licence seats in use not exported"
# The worker ran its boot jobs (update check, Coach plugin) and reports them per queue.
kubectl -n $NS exec sts/activate-worker -- node -e "fetch('http://127.0.0.1:9464/metrics').then(r=>r.text()).then(t=>{ const ok=/activate_jobs_queued\{queue=\"updates\.check\"\}/.test(t) && /activate_job_last_success_timestamp\{job=\"plugin\.update\"\} [1-9]/.test(t); if(!ok){ console.error(t.split('\n').filter(l=>/activate_/.test(l)).join('\n')); process.exit(1) } })" || fail "worker metrics do not show the boot jobs"
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/metrics | grep -q 404 || fail "/metrics is exposed on the application port"

step "web app serves sign-in and proxies the API from its own origin"
forward activate-web 13001 3000
# /sign-in may redirect within the web app (OIDC mode goes to the email-first page); the landing page must be 200.
# OIDC mode: /sign-in sends the browser to the API's PUBLIC host (never the in-cluster address) to authorize,
# with the web app's callback; the email-first /login page itself renders.
loc=$(curl -s -o /dev/null -w '%{redirect_url}' http://127.0.0.1:13001/sign-in)
echo "/sign-in -> $loc"
[[ "$loc" == https://api.activate.smoke.test/oauth/authorize?* ]] || fail "sign-in must redirect to the public API host, got: $loc"
[[ "$loc" == *"redirect_uri=https%3A%2F%2Factivate.smoke.test%2Fcallback"* ]] || fail "authorize request lacks the web app's callback"
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:13001/login); [[ "$code" == "200" ]] || fail "web /login returned $code"
# The same-origin /api proxy is wired and gated: without a session it answers 401 itself; the web app's own
# health handler stays open for its probes.
code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:13001/api/ready); [[ "$code" == "401" ]] || fail "web /api proxy should refuse anonymous calls with 401, got $code"
curl -fsS http://127.0.0.1:13001/api/health >/dev/null || fail "web /api/health"

step "upgrade (migrate hook runs again, pods roll) and rollback"
helm upgrade activate "$ROOT/deploy/helm/activate" -n $NS -f "$WORK/values.yaml" --set api.replicas=2 --wait --timeout 10m >/dev/null
[[ "$(kubectl -n $NS get deploy activate-api -o jsonpath='{.status.readyReplicas}')" == "2" ]] || fail "upgrade did not scale api to 2"
helm history activate -n $NS
helm rollback activate -n $NS --wait --timeout 10m >/dev/null  # to the previous revision
[[ "$(kubectl -n $NS get deploy activate-api -o jsonpath='{.status.readyReplicas}')" == "1" ]] || fail "rollback did not return api to 1 replica"
curl -fsS http://127.0.0.1:13000/api/ready >/dev/null 2>&1 || { forward activate-api 13000 3000; curl -fsS http://127.0.0.1:13000/api/ready >/dev/null || fail "api not ready after rollback"; }

step "data survives a worker restart (the /data volume claim)"
kubectl -n $NS exec sts/activate-worker -- sh -c 'echo "$HOSTNAME $(date -u +%s)" > /data/.smoke-marker' || fail "worker cannot write /data"
kubectl -n $NS delete pod activate-worker-0 --wait=true >/dev/null
kubectl -n $NS rollout status sts/activate-worker --timeout=300s >/dev/null
kubectl -n $NS exec sts/activate-worker -- sh -c 'test -f /data/.smoke-marker && rm /data/.smoke-marker' || fail "worker lost its /data volume across a restart"

echo
echo "KIND SMOKE PASSED"
