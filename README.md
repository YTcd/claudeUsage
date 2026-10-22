# Claude Usage

Claude Code의 **5시간** 및 **7일** 사용량을 리셋까지 남은 시간과 함께
VS Code 상태 표시줄에 보여줍니다.

## 데이터 수집 방식

- **statusLine 브리지 (기본):** Claude Code 세션이 실행 중이면 사용량을
  `~/.claude/cc-usage.json`에 기록하고, 이 확장이 이를 즉시 읽어옵니다 —
  무료이며 요청 제한이 없습니다.
- **OAuth 폴링 (선택, 보조):** 토큰을 설정하면 사용량 API를 주기적으로 조회하여
  열려 있는 세션이 없을 때도 수치를 비교적 최신으로 유지합니다.

## 설정 방법 (기기별)

1. **설치:** `.vsix` 파일을 설치합니다. VS Code → 확장 → `…` 메뉴 → **Install from VSIX…**
2. **브리지 설정:** 명령 팔레트(`Cmd/Ctrl+Shift+P`) →
   **“Claude Usage: Set up statusLine bridge”** 실행. 이 명령은
   `~/.claude/cc-usage-bridge.sh`를 생성하고 `~/.claude/settings.json`의
   `statusLine`이 이 스크립트를 가리키도록 설정합니다. 이후 Claude Code 세션을
   시작하거나 다시 불러오세요.
3. *(선택)* **세션과 무관한 폴링 활성화:** `claude setup-token`을 실행한 뒤,
   발급된 토큰을 **`claudeUsage.oauthToken`** 설정에 붙여 넣습니다.

## 설정 항목

| 설정 | 기본값 | 설명 |
|---|---|---|
| `claudeUsage.oauthToken` | `""` | `claude setup-token`으로 발급한 토큰. 설정 파일에 평문으로 저장됩니다. 비워 두면 브리지만 사용합니다. |
| `claudeUsage.pollIntervalSeconds` | `1800` | 토큰이 설정된 경우의 폴링 주기(초). 엔드포인트의 요청 제한이 매우 엄격하므로 높은 값을 유지하세요. `0` = 수동 갱신만 (상태 표시줄 항목 클릭). |

## 참고 사항

- 상태 표시줄은 데이터를 실제로 신뢰할 수 없을 때(2시간 이상 경과했거나 리셋
  시점을 지난 경우)에만 경고를 표시합니다 — 최근의 유휴 상태 데이터는 정상적으로
  표시됩니다.
- 사용량 API는 공식 문서화되지 않았으며 변경될 수 있지만, 브리지는 그와 관계없이
  계속 동작합니다.
