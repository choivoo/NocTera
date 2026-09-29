# NOCTERRA v1.0.1 — Android 설치 가이드 (Galaxy Z Fold 기준)

NOCTERRA는 **Behavior Pack(NOCTERRA_BP)** 과 **Resource Pack(NOCTERRA_RP)** 두 개로 되어 있습니다. 둘 다 설치하고, 둘 다 월드에 적용해야 합니다.

- 권장 버전: Minecraft Bedrock **1.26.50 이상**. 너무 오래된 버전이면 가져오기가 실패합니다.
- 다른 애드온은 끄고 먼저 테스트하세요. 특히 플레이어 모델을 바꾸는 애드온과는 충돌합니다.

| 파일 | 용도 |
|---|---|
| `NOCTERRA_v1.0.1.mcaddon` | 두 팩이 한 파일에 들어 있습니다 (METHOD A) |
| `NOCTERRA_BP_v1.0.1.mcpack` / `NOCTERRA_RP_v1.0.1.mcpack` | 팩을 하나씩 가져옵니다 (METHOD B) |
| `NOCTERRA_BP_v1.0.1.zip` / `NOCTERRA_RP_v1.0.1.zip` | 수동 설치용 폴더 (METHOD C) |
| `NOCTERRA_ANDROID_MANUAL_INSTALL.zip` | 수동 설치 폴더 구조 전체와 이 문서 (METHOD C) |

---

## METHOD A — .mcaddon 열기

1. **내 파일**(Samsung) 또는 **Files by Google**에서 `NOCTERRA_v1.0.1.mcaddon`을 누릅니다.
2. "Minecraft로 열기"를 고릅니다. 곧바로 Minecraft가 열리면 정상입니다.
3. Minecraft 상단에 "가져오기 시작 → 성공" 알림이 **두 번**(BP와 RP) 떠야 합니다.

> ⚠️ **안 될 수 있습니다.** Android와 기기에 따라 `.mcaddon` 확장자가 Minecraft에 연결되지 않습니다. "열 수 있는 앱이 없음"이 뜨거나 Play 스토어로 넘어가면 **METHOD B**로 가세요.
> 브라우저나 메신저 앱 안에서 바로 누르면 연결이 안 되는 경우가 많습니다. 먼저 **다운로드 폴더에 저장한 뒤** 파일 앱에서 여세요.

---

## METHOD B — .mcpack 두 개를 따로 열기 (먼저 시도 권장)

1. 파일 앱에서 **`NOCTERRA_RP_v1.0.1.mcpack`** 을 누르고 Minecraft로 엽니다. "가져오기 성공"이 뜨면 됩니다.
2. Minecraft를 나와서 **`NOCTERRA_BP_v1.0.1.mcpack`** 도 똑같이 엽니다.
   - RP를 먼저 넣는 이유: BP가 RP에 의존하기 때문입니다. 순서가 바뀌어도 둘 다 들어가면 됩니다.
3. "열기" 목록에 Minecraft가 없으면:
   - 파일을 길게 누르기 → **다음으로 열기 / 연결 프로그램** → **Minecraft**를 고릅니다.
   - 그래도 없으면 **METHOD C**로 가세요.

> 참고: Android는 `.mcpack` / `.mcaddon`을 앱에 연결할 때 확장자만 봅니다. 파일 이름 끝이 `.mcpack.zip`처럼 바뀌어 있으면 안 됩니다. 이름 바꾸기로 `.zip`을 지워 주세요.

---

## METHOD C — 폴더를 직접 넣기 (수동 설치)

### C-1. Minecraft 저장 위치를 "외부"로 바꾸기
1. Minecraft → **설정(Settings)** → **저장 공간(Storage)**
2. **파일 저장 위치(File Storage Location)** → **외부(External)** 로 바꿉니다.
   - "내부(Application)"로 두면 앱 전용 공간이라 파일 앱에서 보이지 않습니다.
   - 위치를 바꾸면 기존 월드가 새 위치로 옮겨지지 않을 수 있습니다. 필요하면 먼저 월드를 내보내기(백업)하세요.
3. Minecraft를 완전히 종료합니다. 최근 앱에서 스와이프해서 닫으세요.

### C-2. 폴더 위치
외부 저장소를 쓰면 Bedrock 데이터는 보통 아래 경로에 있습니다.

```
내장 저장공간/Android/data/com.mojang.minecraftpe/files/games/com.mojang/
    behavior_packs/
    resource_packs/
```

> ⚠️ **Android 11 이상(Scoped Storage)** 에서는 `Android/data` 폴더 접근이 막혀 있을 수 있습니다.
> - Samsung **내 파일** 앱에서 `Android/data`를 누르면 "접근 허용"을 묻는 기기도 있고, 아예 막혀 있는 기기도 있습니다(One UI 버전에 따라 다름).
> - 막혀 있으면 **PC에 USB로 연결**해서(파일 전송 모드) 같은 경로에 복사하는 방법이 가장 확실합니다.
> - 이 경로가 보이지 않으면 C-1의 "외부" 설정이 적용됐는지 다시 확인하세요. Minecraft를 한 번 켰다 끄면 폴더가 만들어집니다.

### C-3. 복사
1. `NOCTERRA_ANDROID_MANUAL_INSTALL.zip`의 압축을 풉니다(파일 앱 → 압축 풀기).
2. 복사할 것:
   - `behavior_packs/NOCTERRA_BP` 폴더 → `games/com.mojang/behavior_packs/` 안으로
   - `resource_packs/NOCTERRA_RP` 폴더 → `games/com.mojang/resource_packs/` 안으로
3. **폴더 구조를 반드시 확인하세요.** 가장 흔한 실패 원인입니다.

```
✅ 정상
games/com.mojang/behavior_packs/NOCTERRA_BP/manifest.json
games/com.mojang/resource_packs/NOCTERRA_RP/manifest.json

❌ 잘못됨 (폴더가 한 겹 더 있음)
games/com.mojang/behavior_packs/NOCTERRA_BP/NOCTERRA_BP/manifest.json
games/com.mojang/behavior_packs/NOCTERRA_ANDROID_MANUAL_INSTALL/...
```

`NOCTERRA_BP_v1.0.1.zip` / `NOCTERRA_RP_v1.0.1.zip`를 쓸 때는 `behavior_packs/` 안에서(또는 `resource_packs/` 안에서) 바로 압축을 풀면 위의 정상 구조가 됩니다.

---

## 팩 활성화 (A·B·C 공통)

1. Minecraft → **플레이** → **새로 만들기**(또는 기존 월드 옆 ✏️ **편집**)
2. 왼쪽 **행동 팩(Behavior Packs)** → **내 팩(My Packs)** → **NOCTERRA BP** → **활성화(Activate)**
   - "이 팩은 리소스 팩이 필요합니다"라는 알림이 뜨면 **적용**을 누릅니다. RP가 자동으로 추가됩니다.
3. 왼쪽 **리소스 팩(Resource Packs)** → **활성(Active)** 목록에 **NOCTERRA RP** 가 있는지 **꼭 확인**하세요.
   - 없으면 **내 팩** → **NOCTERRA RP** → **활성화**.
   - BP가 RP를 자동으로 켜 줘도, 실제로 **활성** 목록에 올라가 있어야 모델·버튼·HUD가 보입니다.
4. 실험적 기능(Experiments)은 **켜지 않아도 됩니다.**
5. 월드를 만들거나 실행합니다.
6. 멀티플레이 서버/Realm 참가자는 설정 → 전역 리소스가 아니라 **월드 리소스 팩**을 받도록 허용해야 합니다.

## 설치 확인
- 접속하면 **N O C T E R R A / TAP TO START** 화면이 나와야 합니다.
- 채팅에서 `/noct:noct selftest`를 입력하면 결과가 모두 **PASS**여야 합니다. 월드 관리자(운영자) 권한이 필요합니다.
  - `player.override FAIL`이면 RP/BP 중 하나가 빠졌거나, 다른 애드온이 플레이어를 덮어쓰고 있는 것입니다.
- 문제가 있으면 `/noct:noct report` 결과를 스크린샷으로 보내 주세요.

## 자주 생기는 문제
| 증상 | 원인 / 해결 |
|---|---|
| "열 수 있는 앱이 없음" | 확장자가 연결되지 않았습니다 → METHOD B의 "다음으로 열기", 안 되면 METHOD C |
| 가져오기 실패 "manifest를 찾을 수 없음" | 폴더가 한 겹 더 있습니다 → C-3 구조 확인 |
| 가져오기 실패 "지원되지 않는 버전" | Minecraft를 1.26.50 이상으로 업데이트하세요 |
| 내 팩 목록에 안 보임 | 저장 위치(내부/외부)와 복사한 경로가 다릅니다. Minecraft를 완전히 껐다 켜세요 |
| 캐릭터가 스티브 모습 | RP가 활성화되지 않았습니다 → 리소스 팩 **활성** 목록 확인 |
| 핫바 버튼이 보라/검정 격자 | RP 텍스처가 빠졌습니다 → RP 재설치 |
