#!/bin/bash
# FoundrySignal golden-path smoke test — exercises the REAL API end to end.
# No fabricated data: ingests a real public website + real Solana mint.
set -e
BASE=http://localhost:3000
JAR=/tmp/fs-smoke-cookies.txt
rm -f $JAR

echo "── 1. Health"
curl -s $BASE/api/v1/health | head -c 200; echo

echo "── 2. Register researcher"
REG=$(curl -s -c $JAR -X POST $BASE/api/v1/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"smoke-$(date +%s)@test.local\",\"password\":\"smoke-password-123\",\"name\":\"Smoke Tester\"}")
echo "$REG" | head -c 200; echo

echo "── 3. Account state"
curl -s -b $JAR $BASE/api/v1/account | head -c 300; echo

echo "── 4. Create venture (real website + real mint)"
V=$(curl -s -b $JAR -X POST $BASE/api/v1/ventures -H 'Content-Type: application/json' -d '{
  "name": "Jupiter Exchange",
  "tagline": "Solana liquidity aggregator",
  "category": "DEFI",
  "websiteUrl": "https://jup.ag",
  "githubOrgUrl": "https://github.com/jup-ag",
  "mint": "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN"
}')
echo "$V" | head -c 400; echo
SLUG=$(echo "$V" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['slug'])" 2>/dev/null)
echo "slug=$SLUG"

echo "── 5. Wait for collectors (10s)"
sleep 10

echo "── 6. Dossier"
curl -s -b $JAR $BASE/api/v1/ventures/$SLUG > /tmp/fs-dossier.json
python3 - << 'EOF'
import json
d = json.load(open('/tmp/fs-dossier.json'))['data']
v = d['venture']
print(f"venture: {v['name']} ({v['slug']}) evidence={d['evidenceCount']}")
print(f"identities: {[ (i['identityType'], i['externalId']) for i in d['identities'] ]}")
print(f"repos: {len(d['repositories'])}  products: {[(p['status']) for p in d['products']]}")
print(f"tokens: {[(t['mint'][:10], t['decimals'], t['mintAuthority'] is not None, t['supply']) for t in d['tokenAssets']]}")
print(f"onchainObs: {len(d['onchainObservations'])}  marketSnaps: {len(d['marketSnapshots'])}")
print(f"claims: {[(c['statement'][:60], c['status']) for c in d['claims']]}")
print(f"history: {[h['summary'][:60] for h in d['history'][:6]]}")
EOF

echo "── 7. Evidence records (provenance)"
curl -s -b $JAR "$BASE/api/v1/ventures/$SLUG/evidence" -o /tmp/fs-evidence.json
python3 -c "
import json
rows = json.load(open('/tmp/fs-evidence.json'))['data']
print(f\"{len(rows)} evidence records\")
for r in rows[:6]:
    print(f\"  [{r['provider']}/{r['sourceType']}] verification={r['verification']} hash={r['contentHash'][:12] if r['contentHash'] else None} url={(r['url'] or '')[:60]}\")"

echo "── 8. AI research run (REAL LLM)"
VID=$(python3 -c "import json; print(json.load(open('/tmp/fs-dossier.json'))['data']['venture']['id'])")
RUN=$(curl -s -b $JAR -X POST $BASE/api/v1/research/runs -H 'Content-Type: application/json' \
  -d "{\"ventureId\":\"$VID\",\"question\":\"What has this venture verifiably shipped and what is its token structure?\"}")
echo "$RUN" | head -c 200; echo
RID=$(echo "$RUN" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['runId'])")

echo "── 9. Poll research run (max 150s)"
for i in $(seq 1 30); do
  sleep 5
  S=$(curl -s -b $JAR $BASE/api/v1/research/runs/$RID)
  ST=$(echo "$S" | python3 -c "import sys,json; d=json.load(sys.stdin)['data']; print(d['status'])")
  echo "  poll $i: $ST"
  if [ "$ST" = "COMPLETED" ] || [ "$ST" = "FAILED" ]; then
    curl -s -b $JAR $BASE/api/v1/research/runs/$RID > /tmp/fs-run.json
    break
  fi
done
python3 -c "
import json
d = json.load(open('/tmp/fs-run.json'))['data']
if d['report']:
    r = d['report']
    print(f\"report validation={r['validationStatus']} sections={len(r['sections'])} citations={list(r['citations'].keys())}\")
    for s in r['sections'][:4]:
        print(f\"  ## {s['heading']}: {s['body'][:160]}...\")
else:
    print(f\"run status={d['status']} failure={d.get('failureReason')}\")"

echo "── 10. Watchlist + alert"
WL=$(curl -s -b $JAR -X POST $BASE/api/v1/watchlists -H 'Content-Type: application/json' -d '{"name":"Smoke list"}')
WLID=$(echo "$WL" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")
curl -s -b $JAR -X POST $BASE/api/v1/watchlists/$WLID/items -H 'Content-Type: application/json' -d "{\"ventureId\":\"$VID\"}" | head -c 150; echo
curl -s -b $JAR -X POST $BASE/api/v1/alerts -H 'Content-Type: application/json' -d "{\"ventureId\":\"$VID\",\"kind\":\"RELEASE_PUBLISHED\"}" | head -c 150; echo
curl -s -b $JAR $BASE/api/v1/watchlists | head -c 300; echo

echo "── 11. Quote preview (real Jupiter, gated execution)"
Q=$(curl -s -b $JAR -X POST $BASE/api/v1/markets -H 'Content-Type: application/json' \
  -d '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN","amount":"100000000","slippageBps":50}')
echo "$Q" | head -c 500; echo

echo "── 12. Trading release gates (status, order intent, admin RBAC)"
G=$(curl -s -b $JAR $BASE/api/v1/trading/gates)
echo "$G" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('executionAllowed:', d['executionAllowed'], '| blockReason:', d['blockReason'][:100])"
OI=$(curl -s -b $JAR -X POST $BASE/api/v1/trading/order-intents -H 'Content-Type: application/json' \
  -d '{"inputMint":"So11111111111111111111111111111111111111112","outputMint":"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN","amount":"100000000","slippageBps":50}')
echo "$OI" | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; i=d['intent']; print('intent status:', i['status'], '| executionAllowed:', d['readiness']['executionAllowed'])"
EX=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR -X POST $BASE/api/v1/trading/execute -H 'Content-Type: application/json' \
  -d '{"intentId":"x","walletAddress":"So1111111111111111111111111111111111111111","signedTransaction":"'"$(python3 -c "print('A'*300)")"'"}')
echo "execute while gated → HTTP $EX (expect 403)"
GA=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR $BASE/api/v1/admin/trading-gates)
echo "non-admin reading gate admin API → HTTP $GA (expect 403)"

echo "── 13. Pricing catalog (public, from Plan table)"
P=$(curl -s $BASE/api/v1/pricing)
echo "$P" | python3 -c "
import json,sys
d=json.load(sys.stdin)['data']
print('plans:', [(p['code'], p['monthlyPriceMicros']) for p in d['plans']])
print('purchasingAvailable:', d['purchasingAvailable'])"

echo "── 14. Cross-tenant isolation probe (second user)"
JAR2=/tmp/fs-smoke2.txt
curl -s -c $JAR2 -X POST $BASE/api/v1/auth/register -H 'Content-Type: application/json' \
  -d "{\"email\":\"smoke2-$(date +%s)@test.local\",\"password\":\"smoke-password-456\",\"name\":\"Other User\"}" > /dev/null
ISO=$(curl -s -o /dev/null -w "%{http_code}" -b $JAR2 $BASE/api/v1/research/runs/$RID)
echo "other user reading our research run → HTTP $ISO (expect 403)"

echo "── 15. Logout"
curl -s -b $JAR -X POST $BASE/api/v1/auth/logout | head -c 120; echo
echo "SMOKE COMPLETE"
