/**
 * pi-dailylog — Obsidian 일일 업무일지 pi 확장
 *
 * 외부 API·원격 서비스 없이 순수 로컬 파일만 다룬다.
 *
 * 제공:
 *   - 명령어 `/dl [create|done|plan|retro|memo|path] ...`
 *   - LLM 툴 `dailylog_create`, `dailylog_add` (자연어 라우팅용)
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
	addItems,
	createDaily,
	dailyPath,
	type DlConfig,
	type SectionKey,
	SECTION_HEADERS,
} from "./dailylog.ts";

// ── 설정 로드 ────────────────────────────────────────────────────

const HERE = dirname(fileURLToPath(import.meta.url));

const DEFAULTS = {
	companyFolder: "00. 🏢 회사",
	logFolder: "00_업무일지",
};

function loadConfig(): DlConfig {
	const file = join(HERE, "..", "config.json");
	let fromFile: Partial<DlConfig> = {};
	if (existsSync(file)) {
		try {
			fromFile = JSON.parse(readFileSync(file, "utf8"));
		} catch (e) {
			throw new Error(`config.json 파싱 실패: ${(e as Error).message}`);
		}
	}
	const basePath = process.env.DAILYLOG_BASE_PATH ?? fromFile.basePath ?? "";
	if (!basePath) {
		throw new Error(
			"업무일지 base_path 미설정. config.json 의 basePath 또는 환경변수 DAILYLOG_BASE_PATH 를 설정하세요.",
		);
	}
	return {
		basePath,
		companyFolder: fromFile.companyFolder ?? DEFAULTS.companyFolder,
		logFolder: fromFile.logFolder ?? DEFAULTS.logFolder,
	};
}

const SECTION_KEYS: SectionKey[] = ["done", "plan", "retro", "memo"];
const isSectionKey = (s: string): s is SectionKey =>
	(SECTION_KEYS as string[]).includes(s);

/** 쉼표로 여러 항목 분리 */
const splitItems = (text: string): string[] =>
	text
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);

// ── 확장 ─────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
	// ---- 명령어: /dl ----
	pi.registerCommand("dl", {
		description:
			"업무일지: /dl [create|done|plan|retro|memo|path] <내용> [-r 1~5] — 그 외 자연어는 자동 처리",
		handler: async (args, ctx) => {
			let cfg: DlConfig;
			try {
				cfg = loadConfig();
			} catch (e) {
				ctx.ui.notify((e as Error).message, "error");
				return;
			}
			const today = new Date();
			const raw = (args ?? "").trim();
			const [sub, ...rest] = raw.split(/\s+/);
			const remainder = rest.join(" ").trim();

			// 서브커맨드 없음 또는 create → 오늘 파일 생성
			if (!sub || sub === "create") {
				let importPlan = false;
				if (ctx.hasUI) {
					importPlan = await ctx.ui.confirm(
						"업무일지 생성",
						"어제(최근) 주간 업무 계획을 가져올까요?",
					);
				}
				const r = createDaily(cfg, today, importPlan);
				ctx.ui.notify(
					r.created
						? `업무일지 생성됨${r.importedPlan ? " (주간 계획 이월)" : ""}: ${r.path}`
						: `이미 존재: ${r.path}`,
					"info",
				);
				return;
			}

			if (sub === "path") {
				ctx.ui.notify(dailyPath(cfg, today), "info");
				return;
			}

			if (isSectionKey(sub)) {
				let priority: number | undefined;
				let body = remainder;
				// plan 우선순위 파싱: -r N | --priority N
				const rm = body.match(/(?:^|\s)(?:-r|--priority)\s+([1-5])(?=\s|$)/);
				if (rm) {
					priority = Number(rm[1]);
					body = (body.slice(0, rm.index) + body.slice(rm.index! + rm[0].length)).trim();
				}
				if (!body) {
					ctx.ui.notify(`내용이 비었습니다. 예) /dl ${sub} 내용`, "warning");
					return;
				}
				if (sub === "plan" && priority == null) {
					priority = await askPriority(ctx);
					if (priority == null) return; // 취소
				}
				const items = splitItems(body);
				const r = addItems(cfg, today, sub, items, priority);
				ctx.ui.notify(
					`[${r.section}] 추가: ${r.added.join(", ")}${r.created ? " (파일 생성됨)" : ""}`,
					"info",
				);
				return;
			}

			// 서브커맨드가 아니면 자연어로 보고 LLM 에게 넘긴다(툴로 라우팅).
			pi.sendUserMessage(`업무일지: ${raw}`);
		},
	});

	// ---- LLM 툴: 오늘 파일 생성 ----
	pi.registerTool({
		name: "dailylog_create",
		label: "업무일지 생성",
		description:
			"오늘 날짜의 Obsidian 업무일지 파일을 생성한다(이미 있으면 그대로 둔다). " +
			"importPlan=true 이면 가장 최근 업무일지의 '주간 업무 계획'을 하위 불릿까지 이월한다.",
		promptSnippet: "오늘 업무일지 파일을 생성/확인",
		parameters: Type.Object({
			importPlan: Type.Optional(
				Type.Boolean({ description: "최근 주간 계획 이월 여부(기본 false)" }),
			),
		}),
		async execute(_id, params) {
			const cfg = loadConfig();
			const r = createDaily(cfg, new Date(), params.importPlan ?? false);
			return {
				content: [
					{
						type: "text",
						text: r.created
							? `생성됨: ${r.path}${r.importedPlan ? " (주간 계획 이월됨)" : ""}`
							: `이미 존재: ${r.path}`,
					},
				],
				details: r,
			};
		},
	});

	// ---- LLM 툴: 섹션에 항목 추가 ----
	pi.registerTool({
		name: "dailylog_add",
		label: "업무일지 항목 추가",
		description:
			"오늘 업무일지의 특정 섹션에 항목을 추가한다(파일 없으면 자동 생성). " +
			"section: 'done'(완료한 일), 'plan'(주간 계획), 'retro'(회고), 'memo'(메모). " +
			"plan 은 priority(1~5)를 함께 주면 '(순위 : N)'을 붙이고 우선순위 오름차순으로 정렬한다.",
		promptSnippet: "업무일지 완료/계획/회고/메모 항목 추가",
		promptGuidelines: [
			"사용자가 '방금 ~했어', '~완료', '~끝냄' 처럼 완료를 말하면 dailylog_add 를 section='done' 으로 호출한다.",
			"'이번주 ~할 예정', '~해야 해', '계획' 은 dailylog_add 를 section='plan' 으로 호출하되, 우선순위(1~5)가 불명확하면 먼저 사용자에게 물어본다.",
			"'회고', '아쉬운 점', '느낀 점' 은 dailylog_add 를 section='retro' 로 호출한다.",
			"어미('했어','완료','예정' 등)를 제거하고 핵심 업무 내용만 items 로 전달한다.",
		],
		parameters: Type.Object({
			section: Type.String({
				description: "done | plan | retro | memo",
			}),
			items: Type.Array(Type.String(), {
				description: "추가할 항목들(핵심 내용만). 여러 개 가능.",
			}),
			priority: Type.Optional(
				Type.Integer({
					minimum: 1,
					maximum: 5,
					description: "plan 전용 우선순위(1=가장 급함 ~ 5=가장 여유)",
				}),
			),
		}),
		async execute(_id, params) {
			const cfg = loadConfig();
			const section = params.section.trim().toLowerCase();
			if (!isSectionKey(section)) {
				return {
					content: [
						{
							type: "text",
							text: `잘못된 section: ${params.section}. 허용: ${SECTION_KEYS.join(", ")}`,
						},
					],
					isError: true,
					details: {},
				};
			}
			const r = addItems(cfg, new Date(), section, params.items, params.priority);
			return {
				content: [
					{
						type: "text",
						text: `[${r.section}] 추가: ${r.added.join(", ")}${
							r.created ? " (파일 생성됨)" : ""
						}\n${r.path}`,
					},
				],
				details: r,
			};
		},
	});

	// startup 로그(TUI에서만)
	pi.on("session_start", (_e, ctx) => {
		try {
			const cfg = loadConfig();
			ctx.ui.setStatus("dailylog", `업무일지: ${cfg.basePath}`);
		} catch {
			/* 설정 없으면 조용히 무시 */
		}
	});
}

/** 주간 계획 우선순위 선택 (TUI) */
async function askPriority(ctx: ExtensionContext): Promise<number | undefined> {
	if (!ctx.hasUI) return 3;
	const choice = await ctx.ui.select("주간 계획 우선순위 (1=가장 급함 ~ 5=가장 여유)", [
		"1 · 내일~모레 안에 (가장 급함)",
		"2 · 이번 주 안에",
		"3 · 보통",
		"4 · 여유 있을 때",
		"5 · 아주 여유로울 때",
	]);
	if (choice == null) return undefined;
	return Number(choice.slice(0, 1));
}

export type { DlConfig };
export { SECTION_HEADERS };
