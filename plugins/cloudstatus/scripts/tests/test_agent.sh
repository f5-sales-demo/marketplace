#!/usr/bin/env bash
# xcsh task-agent contracts.

set -euo pipefail

extract_frontmatter() {
  awk '/^---$/{n++; next} n==1' "$1"
}

agent_tools() {
  extract_frontmatter "$1" | awk '
    /^tools:/ { in_tools=1; next }
    in_tools && /^  - / { sub(/^  - /, ""); print; next }
    in_tools && /^[^ ]/ { exit }
  '
}

test_literal_agent_names_exist() {
  grep -q '^name: cloudstatus-status-operator$' "$PLUGIN_ROOT/agents/cloudstatus-status-operator.md"
  grep -q '^name: cloudstatus-network-operator$' "$PLUGIN_ROOT/agents/cloudstatus-network-operator.md"

  grep -rq 'agent.*cloudstatus-status-operator' "$PLUGIN_ROOT/skills" || {
    echo "status agent is not named literally in a task call"
    return 1
  }
  grep -rq 'agent.*cloudstatus-network-operator' "$PLUGIN_ROOT/skills" || {
    echo "network agent is not named literally in a task call"
    return 1
  }
}

test_agents_use_only_valid_xcsh_tools() {
  local status_tools network_tools
  status_tools=$(agent_tools "$PLUGIN_ROOT/agents/cloudstatus-status-operator.md" | sort | tr '\n' ' ')
  network_tools=$(agent_tools "$PLUGIN_ROOT/agents/cloudstatus-network-operator.md" | sort | tr '\n' ' ')

  [ "$status_tools" = "bash read " ] || {
    echo "status tools: $status_tools"
    return 1
  }
  [ "$network_tools" = "bash read web_search " ] || {
    echo "network tools: $network_tools"
    return 1
  }
}

test_skills_use_xcsh_task_calls_not_claude_agent_calls() {
  grep -rq 'task' "$PLUGIN_ROOT/skills" || {
    echo "no xcsh task guidance"
    return 1
  }
  if grep -rIEn 'Agent\(|subagent_type|allowed_tools|disallowedTools' \
    "$PLUGIN_ROOT/skills" "$PLUGIN_ROOT/agents" "$PLUGIN_ROOT/commands"; then
    echo "Claude-style delegation metadata remains"
    return 1
  fi
}

test_network_operator_documents_evidence_boundaries() {
  local agent="$PLUGIN_ROOT/agents/cloudstatus-network-operator.md"
  grep -qi 'observed facts' "$agent"
  grep -qi 'inference' "$agent"
  grep -qi 'unresolved' "$agent"
  grep -q 'web_search' "$agent"
  if grep -Eq 'network_lookup\.py (location|locations)|correlation-rules' "$agent"; then
    echo "general network operator still handles Regional Edge locations"
    return 1
  fi
}
