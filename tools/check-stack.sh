#!/usr/bin/env bash
# Kiểm tra cả chuỗi: 4 dịch vụ sống, và CẢ HAI agent nhận được memory injection.
#
# Phép thử thật nằm ở hai probe cuối: hỏi model xem nó được gán agent/task nào.
# Nếu nó tự nói đúng tên thì injection đã tới prompt. Chỉ ping /health thì
# không phát hiện được lỗi im lặng kiểu "thiếu header session" — request vẫn
# 200, model vẫn trả lời, chỉ là rỗng ký ức.
set -uo pipefail
cd "$(dirname "$0")/.."

IP="${WSL_IP:-$(wsl -- hostname -I 2>/dev/null | tr -d '\0\r' | awk '{print $1}')}"
[ -z "$IP" ] && { echo "không lấy được IP của WSL"; exit 1; }

# shellcheck disable=SC2046
export $(grep -E '^[a-zA-Z_]+=' .lab-ids | xargs) 2>/dev/null || true
KEY="${LAB_USER_KEY:-${lab_user_key:-}}"
[ -z "$KEY" ] && { echo "thiếu LAB_USER_KEY (env hoặc .lab-ids)"; exit 1; }

echo "WSL IP: $IP"
echo

ok=0; bad=0
# $4="any" — chỉ cần server trả lời là coi như sống. Proxy không có route "/"
# nên 404 ở đó là đúng, không phải hỏng: routes của nó là /:agent/:spaceId/...
probe() {
  printf '  %-16s :%-5s ' "$1" "$2"
  code=$(curl -s --max-time 6 -o /dev/null -w '%{http_code}' "http://$IP:$2$3" 2>/dev/null)
  if [ "$code" = "200" ] || { [ "${4:-}" = "any" ] && [ -n "$code" ] && [ "$code" != "000" ]; }; then
    echo "OK${4:+ ($code)}"; ok=$((ok+1))
  else echo "LỖI ($code)"; bad=$((bad+1)); fi
}
echo "Dịch vụ:"
probe MemoryCore 8420 /health
probe MemoryProxy 8096 / any
probe "Anthropic shim" 8097 /health
probe "Memory Hub" 8123 /health
echo

# ── Probe injection ─────────────────────────────────────────────────────────
# Hai client dùng hai header session KHÁC NHAU — xem docs/RUNBOOK.md §4.
say() { printf '  %-14s ' "$1"; }

echo "Injection (model phải tự nói đúng agent + task):"

say "claude-code"
cat > /tmp/_p_cc.json <<EOF
{"model":"gpt-5.5","max_tokens":150,"messages":[{"role":"user","content":"Tra loi ngan gon: ban duoc gan vao agent nao va task nao?"}]}
EOF
r=$(curl -s --max-time 90 -X POST "http://$IP:8096/claude-code/default/v1/messages" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $KEY" \
  -H "x-team-id: $team_id" -H "x-agent-id: $Architect" -H "x-task-id: $task_bootstrap" \
  -H "x-conversation-id: check-cc-$$" --data-binary @/tmp/_p_cc.json 2>/dev/null)
if echo "$r" | grep -qi "architect"; then echo "OK — nhận diện được Architect"; ok=$((ok+1))
else echo "LỖI — không thấy agent trong câu trả lời"; echo "      $(echo "$r" | head -c 200)"; bad=$((bad+1)); fi

say "codex"
cat > /tmp/_p_cx.json <<'EOF'
{"model":"gpt-5.5","input":[
 {"type":"message","role":"developer","content":[{"type":"input_text","text":"Ban la Codex CLI."}]},
 {"type":"message","role":"user","content":[{"type":"input_text","text":"Tra loi ngan: ban duoc gan vao agent nao, task nao?"}]}
],"stream":false,"store":false}
EOF
r=$(curl -s --max-time 90 -X POST "http://$IP:8096/codex/default/v1/responses" \
  -H 'Content-Type: application/json' -H "Authorization: Bearer $KEY" \
  -H "x-team-id: $team_id" -H "x-agent-id: $Builder" -H "x-task-id: $task_bootstrap" \
  -H "session-id: check-cx-$$" --data-binary @/tmp/_p_cx.json 2>/dev/null)
if echo "$r" | grep -qi "builder"; then echo "OK — nhận diện được Builder"; ok=$((ok+1))
else echo "LỖI — không thấy agent trong câu trả lời"; echo "      $(echo "$r" | head -c 200)"; bad=$((bad+1)); fi

rm -f /tmp/_p_cc.json /tmp/_p_cx.json
echo
echo "Kết quả: $ok đạt, $bad hỏng"
[ "$bad" -eq 0 ] || exit 1
