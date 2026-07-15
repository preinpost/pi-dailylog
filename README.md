# pi-dailylog

Obsidian에 **일일 업무일지**를 만들고 기록하는 [pi](https://pi.dev) 확장 패키지.
외부 API·원격 서비스 없이 순수 로컬 파일만 다룬다.

자연어로 "방금 ~했어", "이번주 ~할 예정" 처럼 말하면 에이전트가 알아서 오늘 일지의
알맞은 섹션에 적어준다. `/dl` 명령으로 직접 조작할 수도 있다.

## 무엇을 하나

날짜별 마크다운 파일을 아래 경로 규칙으로 생성/갱신한다.

```
{basePath}/{companyFolder}/{YYYY}/{logFolder}/{MM}월/〔W{N}〕 {DD}(요일).md
```

- **주차(W번호)**: 월요일 시작 주, 1일이 속한 주가 W1. (`ceil((일 + 1일의요일오프셋)/7)`)
- **주간 업무 계획**: `(순위 : N)` 접미사가 붙고 우선순위 오름차순으로 자동 정렬.
- **주간 계획 이월**: 새 일지를 만들 때 가장 최근 일지의 `주간 업무 계획`을 하위 불릿까지
  그대로 가져올 수 있다.

생성되는 파일 예시:

```markdown
## 일일 진행 업무
* API 리팩토링
* 코드리뷰

## 주간 업무 계획
* 긴급 배포 (순위 : 1)
* JPA 리팩토링 (순위 : 3)

## 회고
* 내일부터 개발

## 메모
* 
```

## 요구사항

- [pi](https://pi.dev)
- Node.js 18+ (pi 런타임에 포함)
- Obsidian vault(또는 임의의 마크다운 폴더) 하나

## 설치

pi 패키지로 설치한다.

```bash
pi install git:github.com/preinpost/pi-dailylog

# 로컬에서 개발하며 쓸 때
pi install /path/to/pi-dailylog
```

설치하면 `~/.pi/agent/settings.json`의 `packages`에 추가되고 `pi list`에 표시된다.
TUI에서 `/reload`로 즉시 반영된다. 런타임은 pi가 제공하는 `typebox`와 Node 내장 모듈만
쓰고 pi 타입은 타입 전용 import라 실행 시 제거되므로, 별도 `npm install`이 필요 없다.

## 설정

저장소 루트에 `config.json`을 만든다(`config.example.json` 복사). 이 파일은 `.gitignore`에
들어 있어 커밋되지 않는다.

```json
{
  "basePath": "/path/to/your/obsidian-vault",
  "companyFolder": "00. 🏢 회사",
  "logFolder": "00_업무일지"
}
```

| 키 | 설명 | 기본값 |
|---|---|---|
| `basePath` | vault 루트 경로 (**필수**) | — (환경변수 `DAILYLOG_BASE_PATH`로도 지정 가능) |
| `companyFolder` | vault 안의 최상위 폴더명 | `00. 🏢 회사` |
| `logFolder` | 연도 폴더 안의 업무일지 폴더명 | `00_업무일지` |

vault 위치를 옮길 때는 `basePath`만 바꾸면 된다.

## 사용법

### 명령어 `/dl`

| 명령 | 동작 |
|---|---|
| `/dl` 또는 `/dl create` | 오늘 업무일지 생성 (주간 계획 이월 여부 확인) |
| `/dl done <내용>[, 내용2]` | `일일 진행 업무`에 추가(쉼표로 여러 개) |
| `/dl plan <내용> -r <1~5>` | `주간 업무 계획`에 추가(우선순위 생략 시 질문) |
| `/dl retro <내용>` | `회고`에 추가 |
| `/dl memo <내용>` | `메모`에 추가 |
| `/dl path` | 오늘 파일 경로 출력 |
| `/dl <자연어>` | 위 서브커맨드가 아니면 에이전트가 알아서 처리 |

우선순위 척도(`-r`): `1` 가장 급함 ~ `5` 가장 여유.

### 자연어 (LLM 툴)

`dailylog_create`, `dailylog_add` 툴이 등록돼 있어 슬래시 없이도 자연어로 기록할 수 있다.

- "방금 API 리팩토링 했어" → `일일 진행 업무`에 추가
- "이번주 JPA 리팩토링 할 예정" → `주간 업무 계획`에 추가 (우선순위를 되물음)
- "회고: 내일부터 개발" → `회고`에 추가

## 개발

```bash
node --experimental-strip-types test/run.ts   # 순수 로직 스모크 테스트
npm install && npm run typecheck              # 타입 체크
```

구조:

```
src/dailylog.ts   순수 로직 (경로/주차 계산, 섹션 추가, 우선순위 정렬, 계획 이월)
src/index.ts      pi 확장 (/dl 명령 + dailylog_create/dailylog_add 툴)
test/run.ts       스모크 테스트
```
