#!/usr/bin/env bash
# The QA tenant's inbox (infra/aws/qa-tenant): newest message for an address, with its subject and links.
#   e2e/prod/inbox.sh iris.admin@activate-qa.lciventure.com
set -euo pipefail
TO="${1:?address}"
BUCKET=lightci-activate-qa-inbox
for key in $(aws s3api list-objects-v2 --bucket "$BUCKET" --prefix mail/ --query 'reverse(sort_by(Contents,&LastModified))[:30].Key' --output text); do
  [ "$key" = "mail/AMAZON_SES_SETUP_NOTIFICATION" ] && continue
  msg=$(aws s3 cp "s3://$BUCKET/$key" -)
  if printf '%s' "$msg" | grep -qi "^To:.*$TO"; then
    printf '%s\n' "$msg" | grep -E "^(Date|From|Subject):" | head -3
    printf '%s' "$msg" | python3 -c "
import sys,email,re,html
m=email.message_from_string(sys.stdin.read())
parts=[p for p in m.walk() if p.get_content_type() in ('text/plain','text/html')]
body=' '.join((p.get_payload(decode=True) or b'').decode(p.get_content_charset() or 'utf-8','replace') for p in parts)
links=sorted(set(html.unescape(u) for u in re.findall(r'https://[^\s\"<>)]+', body) if 'workos' in u or 'authkit' in u or 'activate' in u))
codes=sorted(set(re.findall(r'\b\d{6}\b', re.sub(r'<[^>]+>',' ',body))))
print('LINKS', *links, sep='\n  ')
print('CODES', codes)"
    exit 0
  fi
done
echo "no mail for $TO yet"; exit 1
