import { listRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow } from '@/data/types'

// 应急演练专用规则：通用 local-service 只管单条状态流转，
// 这里的整组下发、班组分批落实、组织人核定、跨台账同步都越级拒收、重复只记一次。
export const DRILL_KEY = 'drillplan'
export const BATCH_KEY = 'drillbatch'
export const QUARTER_NOTE_KEY = 'drillquarternote'
export const FOLLOWUP_KEY = 'householdservice'

// 计划 → 实施 → 评估 → 归档，依次推进，越级的拒收。
export const STAGE_ORDER = ['待排期', '已排期', '已实施', '已评估', '已归档'] as const

// 本供热季排期覆盖的季度：筹备期、供热初期、严寒期、停热检修期。
export const SEASON_QUARTERS = ['2026-Q3', '2026-Q4', '2027-Q1', '2027-Q2']

export type QuarterSlot = {
  name: string
  plans: EntryRow[]
  note: EntryRow | null
}

function splitTeams(value: unknown): string[] {
  return String(value ?? '')
    .split(/[、,，;；\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function nextId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function findPlan(rows: EntryRow[], id: number): { row: EntryRow; index: number } | null {
  const index = rows.findIndex((row) => Number(row.id) === id)
  return index < 0 ? null : { row: rows[index], index }
}

// 阶段门禁：当前状态必须正好是要求的那一级，否则按越级拒收。
function guardStage(row: EntryRow, required: string, action: string): ActionResult | null {
  if (String(row.status) === required) {
    return null
  }
  return {
    ok: false,
    message: `「${row.计划编号}」当前处于「${row.status}」，须按计划、实施、评估、归档依次推进，「${action}」越级拒收`,
  }
}

export function listDrills(): EntryRow[] {
  return [...listRows(DRILL_KEY)].sort((a, b) => Number(a.id) - Number(b.id))
}

export function listBatches(): EntryRow[] {
  return listRows(BATCH_KEY)
}

// 排期：一次多选几条计划，整组下发到参演班组。
export function dispatchPlans(ids: number[]): ActionResult {
  const uniqueIds = [...new Set(ids.map((id) => Number(id)))]
  if (uniqueIds.length === 0) {
    return { ok: false, message: '请先勾选要下发的演练计划' }
  }
  const rows = listRows(DRILL_KEY)
  const selected = uniqueIds
    .map((id) => rows.find((row) => Number(row.id) === id))
    .filter((row): row is EntryRow => Boolean(row))
  if (selected.length !== uniqueIds.length) {
    return { ok: false, message: '勾选的计划里有找不到的记录，请刷新后重试' }
  }
  // 重复提交排期只记一次：同一组计划的签名命中既有批次，直接返回原批次。
  const signature = [...uniqueIds].sort((a, b) => a - b).join(',')
  const batches = listRows(BATCH_KEY)
  const existed = batches.find((batch) => String(batch.签名) === signature)
  if (existed) {
    return { ok: true, message: `该组计划已在「${existed.批次号}」下发，重复提交排期只记一次` }
  }
  const notPending = selected.filter((row) => String(row.status) !== '待排期')
  if (notPending.length > 0) {
    const codes = notPending.map((row) => row.计划编号).join('、')
    return { ok: false, message: `「${codes}」不在待排期状态，不能重复下发，请调整勾选` }
  }
  // 参演班组缺失的先挡下，整组都不下发。
  const missing = selected.filter((row) => splitTeams(row.参演班组).length === 0)
  if (missing.length > 0) {
    const codes = missing.map((row) => row.计划编号).join('、')
    return { ok: false, message: `「${codes}」参演班组缺失，先挡下，请补齐参演班组后再整组下发` }
  }
  const batchNo = `2026-B${String(batches.length + 1).padStart(2, '0')}`
  const selectedIds = new Set(uniqueIds)
  const next = rows.map((row) =>
    selectedIds.has(Number(row.id))
      ? { ...row, status: '已排期', pending: true, 下发批次: batchNo }
      : row,
  )
  saveRows(DRILL_KEY, next)
  saveRows(BATCH_KEY, [
    ...batches,
    {
      id: nextId(batches),
      status: '已下发',
      pending: false,
      abnormal: false,
      批次号: batchNo,
      计划清单: selected.map((row) => row.计划编号).join('、'),
      签名: signature,
      下发时间: today(),
    },
  ])
  return { ok: true, message: `已整组下发 ${selected.length} 条计划到参演班组，批次号「${batchNo}」` }
}

// 实施：演练按班组分批落实，全部班组落实完才转入已实施。
export function recordTeamDone(id: number, team: string): ActionResult {
  const rows = listRows(DRILL_KEY)
  const found = findPlan(rows, id)
  if (!found) {
    return { ok: false, message: `没有找到编号为 ${id} 的演练计划` }
  }
  const gate = guardStage(found.row, '已排期', '班组落实')
  if (gate) {
    return gate
  }
  const teams = splitTeams(found.row.参演班组)
  if (!teams.includes(team)) {
    return { ok: false, message: `「${team}」不在「${found.row.计划编号}」的参演班组名单里` }
  }
  const done = splitTeams(found.row.已落实班组)
  if (done.includes(team)) {
    return { ok: true, message: `「${team}」已落实过，重复提交只记一次` }
  }
  const nextDone = [...done, team]
  const allDone = teams.every((item) => nextDone.includes(item))
  const next = [...rows]
  next[found.index] = {
    ...found.row,
    已落实班组: nextDone.join('、'),
    status: allDone ? '已实施' : '已排期',
    pending: true,
  }
  saveRows(DRILL_KEY, next)
  if (allDone) {
    return { ok: true, message: `全部班组已落实，「${found.row.计划编号}」转入已实施` }
  }
  const left = teams.filter((item) => !nextDone.includes(item))
  return { ok: true, message: `「${team}」落实完成，还剩 ${left.length} 个班组：${left.join('、')}` }
}

// 评估：结论由演练组织人本人核定，核定后同步客服台账的待回访清单。
export function approveEvaluation(id: number, conclusion: string, approver: string): ActionResult {
  const rows = listRows(DRILL_KEY)
  const found = findPlan(rows, id)
  if (!found) {
    return { ok: false, message: `没有找到编号为 ${id} 的演练计划` }
  }
  const gate = guardStage(found.row, '已实施', '核定评估')
  if (gate) {
    return gate
  }
  if (!conclusion.trim()) {
    return { ok: false, message: '评估结论不能为空' }
  }
  if (approver.trim() !== String(found.row.组织人)) {
    return {
      ok: false,
      message: `评估结论须由演练组织人「${found.row.组织人}」本人核定，「${approver.trim() || '空'}」核定拒收`,
    }
  }
  const next = [...rows]
  const updated: EntryRow = {
    ...found.row,
    评估结论: conclusion.trim(),
    核定人: approver.trim(),
    status: '已评估',
    pending: true,
  }
  next[found.index] = updated
  saveRows(DRILL_KEY, next)
  syncFollowup(updated)
  return { ok: true, message: `「${found.row.计划编号}」评估已核定，结果已同步客服台账待回访清单` }
}

// 评估结果同步到客服台账（入户服务）的待回访清单；同一计划只同步一次。
function syncFollowup(plan: EntryRow): void {
  const rows = listRows(FOLLOWUP_KEY)
  const code = `HF-${plan.计划编号}`
  if (rows.some((row) => String(row.服务单号) === code)) {
    return
  }
  saveRows(FOLLOWUP_KEY, [
    ...rows,
    {
      id: nextId(rows),
      status: '已处理',
      pending: true,
      abnormal: false,
      服务单号: code,
      报修用户: String(plan.参演班组),
      服务内容: `演练评估回访：${plan.演练科目}`,
      受理人: String(plan.组织人),
      上门时间: '',
      处理结果: `评估结论：${plan.评估结论}`,
      回访日期: '',
      服务状态: '待回访',
    },
  ])
}

// 归档：只有已评估的才能归档。
export function archivePlan(id: number): ActionResult {
  const rows = listRows(DRILL_KEY)
  const found = findPlan(rows, id)
  if (!found) {
    return { ok: false, message: `没有找到编号为 ${id} 的演练计划` }
  }
  const gate = guardStage(found.row, '已评估', '归档')
  if (gate) {
    return gate
  }
  const next = [...rows]
  next[found.index] = { ...found.row, status: '已归档', pending: false }
  saveRows(DRILL_KEY, next)
  return { ok: true, message: `「${found.row.计划编号}」已归档` }
}

// 季度排期表：每个季度列出计划；没有计划的季度带单独说明，不留空壳。
export function quarterSchedule(): QuarterSlot[] {
  const plans = listDrills()
  const notes = listRows(QUARTER_NOTE_KEY)
  const names = new Set<string>(SEASON_QUARTERS)
  for (const row of plans) {
    names.add(String(row.演练季度))
  }
  for (const note of notes) {
    names.add(String(note.季度))
  }
  return [...names].sort().map((name) => ({
    name,
    plans: plans.filter((row) => String(row.演练季度) === name),
    note: notes.find((item) => String(item.季度) === name) ?? null,
  }))
}

// 某一季度没有计划就单独说明；已有计划的季度不接受说明。
export function saveQuarterNote(quarter: string, text: string, author: string): ActionResult {
  if (!text.trim()) {
    return { ok: false, message: '说明内容不能为空' }
  }
  const hasPlans = listRows(DRILL_KEY).some((row) => String(row.演练季度) === quarter)
  if (hasPlans) {
    return { ok: false, message: `${quarter} 已有演练计划，无需单独说明` }
  }
  const notes = listRows(QUARTER_NOTE_KEY)
  const index = notes.findIndex((item) => String(item.季度) === quarter)
  if (index >= 0) {
    const next = [...notes]
    next[index] = { ...notes[index], 说明: text.trim(), 说明人: author }
    saveRows(QUARTER_NOTE_KEY, next)
    return { ok: true, message: `${quarter} 无计划说明已更新` }
  }
  saveRows(QUARTER_NOTE_KEY, [
    ...notes,
    {
      id: nextId(notes),
      status: '已说明',
      pending: false,
      abnormal: false,
      季度: quarter,
      说明: text.trim(),
      说明人: author,
    },
  ])
  return { ok: true, message: `${quarter} 无计划说明已登记` }
}
