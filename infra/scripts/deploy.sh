#!/usr/bin/env bash
# Wraps terraform + image build/push + service rollout for AWS.
#
# Usage:
#   ./infra/scripts/deploy.sh <env> <command> [extra args]
#
#   env:     dev | prod
#   command: init | plan | apply | destroy | output
#            push     — build + push the API image to ECR
#            rollout  — force a new deployment using the latest image
#            release  — push + rollout
#
# Examples:
#   ./infra/scripts/deploy.sh dev apply
#   ./infra/scripts/deploy.sh dev release
#   IMAGE_TAG=$(git rev-parse --short HEAD) ./infra/scripts/deploy.sh dev release

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${INFRA_DIR}/.." && pwd)"

ENV="${1:-}"
CMD="${2:-}"
shift 2 2>/dev/null || true

DOCKERFILE="${REPO_ROOT}/api/Dockerfile"
BUILD_CONTEXT="${REPO_ROOT}/api"

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

die() { echo "error: $*" >&2; exit 1; }

[[ -n "${ENV}" && -n "${CMD}" ]] || usage
[[ "${ENV}" =~ ^(dev|prod)$ ]] || die "env must be 'dev' or 'prod' (got: ${ENV})"

ENV_DIR="${INFRA_DIR}/aws/envs/${ENV}"
[[ -d "${ENV_DIR}" ]] || die "no such env dir: ${ENV_DIR}"

load_env_file() {
  local file="$1"
  [[ -f "${file}" ]] || return 0

  echo "==> loading env config: ${file#${REPO_ROOT}/}"
  set -a
  # shellcheck source=/dev/null
  source "${file}"
  set +a
}

load_env_file "${INFRA_DIR}/config/common.env"
load_env_file "${INFRA_DIR}/config/aws/common.env"
load_env_file "${INFRA_DIR}/config/aws/${ENV}.env"

IMAGE_TAG="${IMAGE_TAG:-latest}"

tf() { terraform -chdir="${ENV_DIR}" "$@"; }
tfout() { tf output -raw "$1" 2>/dev/null || true; }

aws_push() {
  local repo region
  repo="$(tfout ecr_repository_url)"
  [[ -n "${repo}" ]] || die "ecr_repository_url not in tf state — run 'apply' first"
  region="${repo#*.dkr.ecr.}"; region="${region%%.amazonaws.com*}"

  echo "==> docker login: ${repo%/*}"
  aws ecr get-login-password --region "${region}" \
    | docker login --username AWS --password-stdin "${repo%/*}"

  echo "==> docker build ${repo}:${IMAGE_TAG}"
  docker build --platform linux/amd64 \
    -t "${repo}:${IMAGE_TAG}" \
    -f "${DOCKERFILE}" \
    "${BUILD_CONTEXT}"

  echo "==> docker push"
  docker push "${repo}:${IMAGE_TAG}"
}

aws_rollout() {
  local cluster service task_definition
  cluster="lightci-activate-${ENV}-cluster"
  service="lightci-activate-${ENV}"
  task_definition="$(
    aws ecs describe-task-definition \
      --task-definition "${service}" \
      --query 'taskDefinition.taskDefinitionArn' \
      --output text
  )"
  [[ -n "${task_definition}" && "${task_definition}" != "None" ]] || die "no active task definition found for ${service}"

  echo "==> aws ecs update-service ${cluster}/${service} -> ${task_definition}"
  aws ecs update-service \
    --cluster "${cluster}" \
    --service "${service}" \
    --task-definition "${task_definition}" \
    --force-new-deployment >/dev/null
  echo "==> rollout triggered. Watch with:"
  echo "    aws ecs wait services-stable --cluster ${cluster} --services ${service}"
}

case "${CMD}" in
  init|plan|apply|destroy|output)
    tf "${CMD}" "$@"
    ;;
  push)
    aws_push
    ;;
  rollout)
    aws_rollout
    ;;
  release)
    aws_push
    aws_rollout
    ;;
  *)
    die "unknown command: ${CMD}"
    ;;
esac
