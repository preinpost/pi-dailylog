/**
 * 순수 로직 스모크 테스트: node --experimental-strip-types test/run.ts
 * (pi 런타임 없이 dailylog.ts 만 검증)
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import {
	addItems,
	createDaily,
	dailyPath,
	fileName,
	weekOfMonth,
	type DlConfig,
} from "../src/dailylog.ts";

let failed = 0;
const eq = (name: string, got: unknown, want: unknown) => {
	const ok = JSON.stringify(got) === JSON.stringify(want);
	if (!ok) failed++;
	console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : `  got=${JSON.stringify(got)} want=${JSON.stringify(want)}`}`);
};

const VAULT = "/tmp/pi-dailylog-test";
const cfg: DlConfig = { basePath: VAULT, companyFolder: "00. 🏢 회사", logFolder: "00_업무일지" };
rmSync(VAULT, { recursive: true, force: true });

// 주차 계산 (실제 업무일지 파일과 대조 확인된 케이스)
eq("W 2026-07-15", weekOfMonth(new Date("2026-07-15T12:00:00")), 3);
eq("W 2026-07-01", weekOfMonth(new Date("2026-07-01T12:00:00")), 1);
eq("W 2026-07-06", weekOfMonth(new Date("2026-07-06T12:00:00")), 2);
eq("W 2026-06-01", weekOfMonth(new Date("2026-06-01T12:00:00")), 1);
eq("파일명 2026-07-15", fileName(new Date("2026-07-15T12:00:00")), "〔W3〕 15(수).md");

const today = new Date("2026-07-15T12:00:00");
eq("create.created", createDaily(cfg, today).created, true);
eq("create 재실행은 exists", createDaily(cfg, today).created, false);

addItems(cfg, today, "done", ["API 리팩토링", "코드리뷰"]);
addItems(cfg, today, "plan", ["JPA 리팩토링"], 2);
addItems(cfg, today, "plan", ["긴급 배포"], 1);
addItems(cfg, today, "retro", ["내일부터 개발"]);

const out = readFileSync(dailyPath(cfg, today), "utf8");
eq("done 항목 포함", out.includes("* API 리팩토링") && out.includes("* 코드리뷰"), true);
eq("plan 우선순위 정렬(1이 먼저)", out.indexOf("긴급 배포") < out.indexOf("JPA 리팩토링"), true);
eq("plan 순위 접미사", out.includes("긴급 배포 (순위 : 1)"), true);
eq("memo 플레이스홀더 유지", out.includes("## 메모\n* "), true);

// import-plan 이월
const VAULT2 = "/tmp/pi-dailylog-test2";
const cfg2: DlConfig = { ...cfg, basePath: VAULT2 };
rmSync(VAULT2, { recursive: true, force: true });
const tue = new Date("2026-07-14T12:00:00");
createDaily(cfg2, tue);
addItems(cfg2, tue, "plan", ["이월 계획 A"], 1);
const imp = createDaily(cfg2, new Date("2026-07-15T12:00:00"), true);
eq("import-plan importedPlan=true", imp.importedPlan, true);
eq("import-plan 내용 이월", existsSync(imp.path) && readFileSync(imp.path, "utf8").includes("이월 계획 A"), true);

console.log(failed ? `\n${failed}개 실패` : "\n모든 테스트 통과");
process.exit(failed ? 1 : 0);
