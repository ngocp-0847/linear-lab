#!/usr/bin/env bash
# Chạy một agent qua MemoryProxy để nó nhận được bộ nhớ đội.
#
#   bash tools/run-agent.sh Architect prompts/01-design.md
#   echo "câu hỏi" | bash tools/run-agent.sh Builder -
#
# Vai trò quyết định hai thứ: dùng CLI nào, và gửi `x-agent-id` nào.
#
#   Architect, Reviewer → Claude Code (giao thức Anthropic, qua shim)
#   Builder             → Codex       (giao thức Responses, thẳng lên OpenAI)
#
# ── Bốn thứ phải đúng, sai một cái là mất injection mà KHÔNG báo lỗi ──
#
# 1. Đủ 4 header: x-team-id + x-agent-id + x-task-id + header-session.
#    Mỗi CLI dùng tên header session khác nhau (xem docs/RUNBOOK.md §4).
#
# 2. Claude Code BỎ QUA `ANTHROPIC_AUTH_TOKEN` và `ANTHROPIC_API_KEY` khi đã
#    đăng nhập subscription — nó luôn gửi token OAuth của phiên. Cách duy nhất
#    ép nó gửi user_key của MemoryCore là đặt thẳng `Authorization` trong
#    `ANTHROPIC_CUSTOM_HEADERS`; header này được merge SAU nên ghi đè được.
#
# 3. Phải tắt MCP. Claude Code kế thừa mọi MCP server của máy — ở đây thành
#    163 tool, vượt trần 128 của OpenAI và bị trả `array_above_max_length`.
#
# 4. Prompt truyền qua STDIN. `--mcp-config` là cờ variadic, đặt prompt sau nó
#    sẽ bị nuốt thành tên file config.
set -uo pipefail
cd "$(dirname "$0")/.."

ROLE="${1:?cần vai trò: Architect | Builder | Reviewer}"
SRC="${2:--}"

IP="${WSL_IP:-$(grep '^wsl_ip=' .lab-ids | cut -d= -f2)}"
TEAM=$(grep '^team_id=' .lab-ids | cut -d= -f2)
TASK="${TASK_ID:-$(grep '^task_bootstrap=' .lab-ids | cut -d= -f2)}"
AGENT=$(grep "^${ROLE}=" .lab-ids | cut -d= -f2)
KEY="${LAB_USER_KEY:-$(grep '^LAB_USER_KEY=' .lab-ids | cut -d= -f2)}"
MODEL="${LAB_MODEL:-gpt-5.5}"
PROXY="http://${IP}:8096"

[ -z "$AGENT" ] && { echo "không tìm thấy agent_id cho vai trò '$ROLE' trong .lab-ids"; exit 1; }

PROMPT=$([ "$SRC" = "-" ] && cat || cat "$SRC")
[ -z "${PROMPT// }" ] && { echo "prompt rỗng"; exit 1; }

CONV="${ROLE,,}-$(date +%s)"
echo "── $ROLE ($AGENT) · task=$TASK · conv=$CONV" >&2

case "$ROLE" in
  Architect|Reviewer)
    printf '{"mcpServers":{}}' > /tmp/lab-nomcp.json
    export ANTHROPIC_BASE_URL="$PROXY/claude-code/default"
    export ANTHROPIC_MODEL="$MODEL"
    export CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1
    # Authorization đặt ở đây, KHÔNG dùng ANTHROPIC_AUTH_TOKEN — xem ghi chú 2.
    export ANTHROPIC_CUSTOM_HEADERS="Authorization: Bearer $KEY
x-team-id: $TEAM
x-agent-id: $AGENT
x-task-id: $TASK
x-conversation-id: $CONV"
    printf '%s' "$PROMPT" | claude -p --strict-mcp-config --mcp-config /tmp/lab-nomcp.json
    ;;

  Builder)
    # ── Ba điều đã phải trả giá để biết ──
    #
    # a. MỌI cấu hình provider truyền qua `-c`, KHÔNG ghi vào ~/.codex/config.toml.
    #    Đặt `model_provider` ở config toàn cục sẽ khiến MỌI phiên codex của
    #    người dùng đi qua proxy này — kể cả việc chẳng liên quan gì tới lab.
    #
    # b. `< /dev/null`: codex nối stdin vào prompt khi thấy stdin là pipe. Script
    #    đã đọc prompt rồi truyền qua tham số, nên phải đóng stdin — không thì
    #    nó treo ở "Reading additional input from stdin".
    #
    # c. `network_access=true`: công cụ bộ nhớ của proxy được mô tả dạng
    #    "Bash + curl". Sandbox mặc định chặn lệnh mạng, agent thấy mô tả mà
    #    gọi không được rồi lặng lẽ chuyển sang `git grep`.
    #    (Vẫn chưa đủ — xem docs/adr/0002: policy duyệt lệnh chặn trước.)
    #
    # Codex tự gửi session qua body.client_metadata.session_id nên chỉ cần ba
    # header định danh.
    codex exec --skip-git-repo-check -s workspace-write       -c "sandbox_workspace_write.network_access=true" < /dev/null       -c "model_provider=\"lab-proxy\"" \
      -c "model=\"$MODEL\"" \
      -c "disable_response_storage=true" \
      -c "model_providers.lab-proxy.name=\"Linear Lab proxy\"" \
      -c "model_providers.lab-proxy.wire_api=\"responses\"" \
      -c "model_providers.lab-proxy.base_url=\"$PROXY/codex/default\"" \
      -c "model_providers.lab-proxy.experimental_bearer_token=\"$KEY\"" \
      -c "model_providers.lab-proxy.http_headers.x-team-id=\"$TEAM\"" \
      -c "model_providers.lab-proxy.http_headers.x-agent-id=\"$AGENT\"" \
      -c "model_providers.lab-proxy.http_headers.x-task-id=\"$TASK\"" \
      "$PROMPT"
    ;;

  *) echo "vai trò lạ: $ROLE"; exit 1 ;;
esac
