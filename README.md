# pi-dailylog

Obsidian에 **일일 업무일지**를 만들고 기록하는 [pi](https://pi.dev) 확장.
외부 API·원격 서비스 없이 순수 로컬 파일만 다룬다.

## 무엇을 하나

`{basePath}/{companyFolder}/{YYYY}/{logFolder}/{MM}월/〔W{N}〕 {DD}(요일).md` 형식의
업무일지 파일을 생성/갱신한다. 템플릿은 4개 섹션(`일일 진행 업무`/`주간 업무 계획`/
`회고`/`메모`).

- 주차(W번호): 월요일 시작 주, 1일이 속한 주가 W1. (`ceil((일 + 1일의요일오프셋)/7)`)
- `주간 업무 계획`은 `(순위 : N)` 접미사가 붙고 우선순위 오름차순으로 자동 정렬.

## 설정

`config.json` (저장소 루트, git 제외됨):

```json
{
  "basePath": "/path/to/your/obsidian-vault",
  "companyFolder": "00. 🏢 회사",
  "logFolder": "00_업무일지"
}
```

`config.example.json`을 복사해서 만든다. `basePath`는 환경변수 `DAILYLOG_BASE_PATH`로도
덮어쓸 수 있다. vault 위치를 옮길 때는 `basePath`(필요하면 `companyFolder`/`logFolder`)만
바꾸면 된다.

## 설치

pi 패키지로 설치한다.

```bash
# git 저장소에서
pi install git:github.com/<user>/pi-dailylog

# 또는 로컬 경로에서 (개발 중)
pi install /path/to/pi-dailylog
```

설치하면 `~/.pi/agent/settings.json`의 `packages`에 추가되고 `pi list`에 표시된다.
TUI에서 `/reload`로 즉시 반영된다. (런타임은 pi가 제공하는 `typebox`와 Node 내장
모듈만 쓰고, pi 타입은 타입 전용 import라 실행 시 제거된다 — 별도 npm 설치 불필요.)

## 사용법

### 명령어 `/dl`

| 명령 | 동작 |
|---|---|
| `/dl` 또는 `/dl create` | 오늘 업무일지 생성 (주간 계획 이월 여부 확인) |
| `/dl done <내용>[, 내용2]` | `일일 진행 업무`에 추가(쉼표 복수) |
| `/dl plan <내용> -r <1~5>` | `주간 업무 계획`에 추가(우선순위 생략 시 질문) |
| `/dl retro <내용>` | `회고`에 추가 |
| `/dl memo <내용>` | `메모`에 추가 |
| `/dl path` | 오늘 파일 경로 출력 |
| `/dl <자연어>` | 위 서브커맨드가 아니면 에이전트가 알아서 처리 |

### 자연어 (LLM 툴)

`dailylog_create`, `dailylog_add` 툴이 등록돼 있어 "방금 ~했어", "이번주 ~할 예정",
"회고: ~" 같은 자연어를 에이전트가 알아서 라우팅한다.

## 개발

```bash
node --experimental-strip-types test/run.ts   # 순수 로직 스모크 테스트
npm run typecheck                              # tsc (devDependencies 설치 후)
```
