/**
 * dailylog core — 순수 로컬 파일 로직 (외부 API 없음)
 *
 * Obsidian 업무일지 파일을 생성/갱신한다.
 * 경로: {basePath}/{companyFolder}/{YYYY}/{logFolder}/{MM}월/〔W{N}〕 {DD}(요일).md
 */

import {
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";

export type SectionKey = "done" | "plan" | "retro" | "memo";

export interface DlConfig {
	/** Obsidian vault 루트 */
	basePath: string;
	/** vault 안의 회사 폴더명 */
	companyFolder: string;
	/** 회사 폴더 > 연도 폴더 안의 업무일지 폴더명 */
	logFolder: string;
	/** (선택) 섹션 헤더 라벨 재정의 — 새 일지 템플릿과 섹션 매칭에 모두 적용 */
	sections?: Partial<Record<SectionKey, string>>;
}

/** 서브커맨드/툴 섹션키 → 기본 마크다운 헤더 */
export const SECTION_HEADERS: Record<SectionKey, string> = {
	done: "일일 진행 업무",
	plan: "주간 업무 계획",
	retro: "회고",
	memo: "메모",
};

const SECTION_ORDER: SectionKey[] = ["done", "plan", "retro", "memo"];

/** config.sections 로 기본 헤더를 덮어쓴 최종 헤더 맵 */
function headersOf(cfg: DlConfig): Record<SectionKey, string> {
	return { ...SECTION_HEADERS, ...(cfg.sections ?? {}) };
}

/** 한국어 요일 (getDay: 0=일) */
const DOW = ["일", "월", "화", "수", "목", "금", "토"];

const pad2 = (n: number): string => String(n).padStart(2, "0");

/**
 * 월 기준 주차(W번호). 월요일 시작 주, 1일이 속한 주를 W1로 센다.
 * 검증: 2026년 6·7월 실제 업무일지 파일 및 오늘(2026-07-15=W3)과 일치.
 */
export function weekOfMonth(d: Date): number {
	const first = new Date(d.getFullYear(), d.getMonth(), 1);
	const mondayOffset = (first.getDay() + 6) % 7; // Mon=0 .. Sun=6
	return Math.ceil((d.getDate() + mondayOffset) / 7);
}

export function fileName(d: Date): string {
	const w = weekOfMonth(d);
	return `〔W${w}〕 ${pad2(d.getDate())}(${DOW[d.getDay()]}).md`;
}

export function dailyDir(cfg: DlConfig, d: Date): string {
	return join(
		cfg.basePath,
		cfg.companyFolder,
		String(d.getFullYear()),
		cfg.logFolder,
		`${pad2(d.getMonth() + 1)}월`,
	);
}

export function dailyPath(cfg: DlConfig, d: Date): string {
	return join(dailyDir(cfg, d), fileName(d));
}

/** 빈 템플릿 텍스트 (config 섹션 헤더 반영) */
export function template(cfg: DlConfig): string {
	const h = headersOf(cfg);
	return SECTION_ORDER.map((k) => `## ${h[k]}\n* `).join("\n\n") + "\n";
}

// ── 파싱 / 직렬화 ────────────────────────────────────────────────

interface Section {
	header: string;
	body: string[]; // 헤더 다음 ~ 다음 헤더 전까지의 원본 라인 (앞뒤 빈 줄 제거)
}

function parse(text: string): Section[] {
	const lines = text.replace(/\r\n/g, "\n").split("\n");
	const sections: Section[] = [];
	let cur: Section | null = null;
	for (const line of lines) {
		const m = /^##\s+(.+?)\s*$/.exec(line);
		if (m) {
			cur = { header: m[1], body: [] };
			sections.push(cur);
		} else if (cur) {
			cur.body.push(line);
		}
	}
	for (const s of sections) s.body = trimBlank(s.body);
	return sections;
}

function trimBlank(lines: string[]): string[] {
	let start = 0;
	let end = lines.length;
	while (start < end && lines[start].trim() === "") start++;
	while (end > start && lines[end - 1].trim() === "") end--;
	return lines.slice(start, end);
}

/** 플레이스홀더("* " 또는 "*")만 있는 빈 섹션인지 */
function isPlaceholderOnly(body: string[]): boolean {
	const content = body.filter((l) => l.trim() !== "");
	return content.length === 0 || (content.length === 1 && content[0].trim() === "*");
}

function serialize(sections: Section[]): string {
	return (
		sections
			.map((s) => {
				const body = isPlaceholderOnly(s.body) ? ["* "] : s.body;
				return `## ${s.header}\n${body.join("\n")}`;
			})
			.join("\n\n") + "\n"
	);
}

// ── plan 우선순위 정렬 ───────────────────────────────────────────

const PRIO_RE = /\(순위\s*:\s*(\d+)\)/;

interface Block {
	prio: number;
	lines: string[];
}

/** 최상위 "* " 블록(하위 들여쓰기 라인 포함) 단위로 우선순위 오름차순 stable sort */
function sortPlanBlocks(body: string[]): string[] {
	const blocks: Block[] = [];
	let cur: Block | null = null;
	for (const line of body) {
		if (/^\*\s/.test(line) || line.trim() === "*") {
			const m = PRIO_RE.exec(line);
			cur = { prio: m ? Number(m[1]) : Number.POSITIVE_INFINITY, lines: [line] };
			blocks.push(cur);
		} else if (cur) {
			cur.lines.push(line);
		} else {
			// 앞쪽에 최상위 불릿 없이 시작하는 라인은 그대로 보존
			blocks.push({ prio: -1, lines: [line] });
		}
	}
	return blocks
		.map((b, i) => ({ b, i }))
		.sort((a, z) => (a.b.prio - z.b.prio) || (a.i - z.i))
		.flatMap((x) => x.b.lines);
}

// ── 공개 API ─────────────────────────────────────────────────────

export interface CreateResult {
	path: string;
	created: boolean; // false = 이미 존재
	importedPlan: boolean;
}

/** 가장 최근(과거) 존재하는 업무일지의 "주간 업무 계획" 본문을 가져온다 (최대 14일 소급). */
export function findPreviousPlan(cfg: DlConfig, d: Date): string[] | null {
	for (let back = 1; back <= 14; back++) {
		const prev = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
		const p = dailyPath(cfg, prev);
		if (!existsSync(p)) continue;
		const sections = parse(readFileSync(p, "utf8"));
		const plan = sections.find((s) => s.header === headersOf(cfg).plan);
		if (plan && !isPlaceholderOnly(plan.body)) return plan.body;
		return null; // 가장 최근 파일에 계획이 비었으면 굳이 더 소급하지 않음
	}
	return null;
}

/** 오늘 파일 생성 (이미 있으면 그대로 둠). importPlan 시 최근 주간 계획 이월. */
export function createDaily(cfg: DlConfig, d: Date, importPlan = false): CreateResult {
	const p = dailyPath(cfg, d);
	if (existsSync(p)) return { path: p, created: false, importedPlan: false };

	const sections = parse(template(cfg));
	let imported = false;
	if (importPlan) {
		const prevPlan = findPreviousPlan(cfg, d);
		if (prevPlan && prevPlan.length) {
			const plan = sections.find((s) => s.header === headersOf(cfg).plan);
			if (plan) {
				plan.body = prevPlan;
				imported = true;
			}
		}
	}
	mkdirSync(dirname(p), { recursive: true });
	writeFileSync(p, serialize(sections), "utf8");
	return { path: p, created: true, importedPlan: imported };
}

export interface AddResult {
	path: string;
	section: string;
	added: string[];
	created: boolean; // 파일을 새로 만들었는지
}

/**
 * 섹션에 항목 추가. 파일이 없으면 먼저 생성.
 * plan은 각 항목에 " (순위 : N)"을 붙이고 섹션을 우선순위 오름차순으로 정렬.
 */
export function addItems(
	cfg: DlConfig,
	d: Date,
	section: SectionKey,
	items: string[],
	priority?: number,
): AddResult {
	const clean = items.map((s) => s.trim()).filter(Boolean);
	const createRes = createDaily(cfg, d, false);
	const p = createRes.path;

	const header = headersOf(cfg)[section];
	const sections = parse(readFileSync(p, "utf8"));
	const target = sections.find((s) => s.header === header);
	if (!target) throw new Error(`섹션을 찾을 수 없음: ${header}`);

	const suffix =
		section === "plan" && priority != null ? ` (순위 : ${priority})` : "";
	const newLines = clean.map((i) => `* ${i}${suffix}`);

	const existing = isPlaceholderOnly(target.body) ? [] : target.body;
	let merged = [...existing, ...newLines];
	if (section === "plan") merged = sortPlanBlocks(merged);
	target.body = merged;

	writeFileSync(p, serialize(sections), "utf8");
	return {
		path: p,
		section: header,
		added: clean,
		created: createRes.created,
	};
}
