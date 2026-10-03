import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']
const DRILL_MODULE_KEY = 'emergencydrill'
const DRILL_NOTES_KEY = 'emergencydrillnotes'
const HOUSEHOLD_SERVICE_KEY = 'householdservice'
const DRILL_STATUSES = ['待排期', '已排期', '已实施', '已评估', '已归档'] as const

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  if (key === DRILL_MODULE_KEY) {
    return { ok: false, message: '应急演练台账请通过排期、实施、评估、归档专窗办理，不能越级流转' }
  }
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const currentIndex = meta.statuses.indexOf(current)
  const targetIndex = meta.statuses.indexOf(target)
  if (currentIndex < 0 || targetIndex !== currentIndex + 1) {
    return { ok: false, message: `「${current}」不能直接办理「${action}」，请按台账顺序逐级推进` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

function requiredText(value: unknown, label: string): string {
  const text = String(value ?? '').trim()
  if (!text) {
    throw new Error(`${label}不能为空`)
  }
  return text
}

function nextStorageId(rows: EntryRow[]): number {
  return rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
}

function validDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))
}

function requireDate(value: string, label: string): string {
  if (!validDate(value)) {
    throw new Error(`${label}须填写有效日期（YYYY-MM-DD）`)
  }
  return value
}

function quarterFromDate(value: string): string {
  const month = Number(value.slice(5, 7))
  return `${value.slice(0, 4)}-Q${Math.floor((month - 1) / 3) + 1}`
}

export function listDrillQuarterNotes(): EntryRow[] {
  return [...listRows(DRILL_NOTES_KEY)].sort((a, b) =>
    String(a.演练季度).localeCompare(String(b.演练季度)),
  )
}

export function createDrillPlan(input: Record<string, string>): ActionResult {
  try {
    const rows = listRows(DRILL_MODULE_KEY)
    const theme = requiredText(input.演练主题, '演练主题')
    const type = requiredText(input.演练类型, '演练类型')
    const plannedDate = requireDate(requiredText(input.计划日期, '计划日期'), '计划日期')
    const quarter = quarterFromDate(plannedDate)
    if (listDrillQuarterNotes().some((note) => String(note.演练季度) === quarter)) {
      return { ok: false, message: `${quarter} 已登记无计划说明，不能再创建该季度演练计划` }
    }
    const id = nextStorageId(rows)
    const row: EntryRow = {
      id,
      status: DRILL_STATUSES[0],
      pending: true,
      abnormal: false,
      演练编号: `DRILL-${plannedDate.slice(0, 4)}-${String(id).padStart(3, '0')}`,
      演练主题: theme,
      演练类型: type,
      演练季度: quarter,
      排期周次: '',
      计划日期: plannedDate,
      参演班组: requiredText(input.参演班组, '参演班组'),
      排期批次: '',
      演练组织人: requiredText(input.演练组织人, '演练组织人'),
      实际日期: '',
      班组到场情况: '',
      参演人数: 0,
      评估结论: '',
      评估说明: '',
      评估人: '',
      评估日期: '',
      归档编号: '',
      归档日期: '',
    }
    saveRows(DRILL_MODULE_KEY, [...rows, row])
    return { ok: true, message: `演练计划 ${row.演练编号} 已登记，当前为「${DRILL_STATUSES[0]}」` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '演练计划登记失败' }
  }
}

export function createQuarterNoPlanNote(input: Record<string, string>): ActionResult {
  try {
    const quarter = requiredText(input.演练季度, '演练季度')
    if (!/^\d{4}-Q[1-4]$/.test(quarter)) {
      return { ok: false, message: '演练季度格式应为 YYYY-Qn' }
    }
    const notes = listRows(DRILL_NOTES_KEY)
    if (notes.some((note) => String(note.演练季度) === quarter)) {
      return { ok: false, message: `${quarter} 的无计划说明已经登记，不能重复留壳` }
    }
    if (listRows(DRILL_MODULE_KEY).some((row) => String(row.演练季度) === quarter)) {
      return { ok: false, message: `${quarter} 已有演练计划，不能再登记无计划说明` }
    }
    const row: EntryRow = {
      id: nextStorageId(notes),
      status: '无计划说明',
      pending: false,
      abnormal: false,
      演练季度: quarter,
      说明: requiredText(input.说明, '无计划说明'),
      登记人: requiredText(input.登记人, '登记人'),
      登记日期: requireDate(requiredText(input.登记日期, '登记日期'), '登记日期'),
    }
    saveRows(DRILL_NOTES_KEY, [...notes, row])
    return { ok: true, message: `${quarter} 无计划说明已单独登记` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '无计划说明登记失败' }
  }
}

export function updateDrillCrew(id: number, crew: string): ActionResult {
  const rows = listRows(DRILL_MODULE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: '没有找到该演练计划' }
  }
  if (String(rows[index].status) !== DRILL_STATUSES[0]) {
    return { ok: false, message: '排期下发后不能再改派参演班组' }
  }
  const nextCrew = crew.trim()
  if (!nextCrew) {
    return { ok: false, message: '参演班组不能为空' }
  }
  const next = [...rows]
  next[index] = { ...rows[index], 参演班组: nextCrew }
  saveRows(DRILL_MODULE_KEY, next)
  return { ok: true, message: `参演班组已补录为「${nextCrew}」` }
}

export function dispatchDrillSchedules(ids: number[], input: Record<string, string>): ActionResult {
  if (!ids.length) {
    return { ok: false, message: '请先勾选至少一条待排期计划' }
  }
  const rows = listRows(DRILL_MODULE_KEY)
  const selected = ids
    .map((id) => rows.find((row) => Number(row.id) === id))
    .filter((row): row is EntryRow => Boolean(row))
  if (selected.length !== ids.length) {
    return { ok: false, message: '所选演练计划有缺失，请刷新后重选' }
  }

  const firstBatch = String(selected[0].排期批次 ?? '').trim()
  const sameExistingBatch = firstBatch && selected.every(
    (row) => String(row.status) !== DRILL_STATUSES[0] && String(row.排期批次) === firstBatch,
  )
  if (sameExistingBatch) {
    return { ok: true, message: `排期批次 ${firstBatch} 已生成，重复提交只记一次` }
  }
  if (selected.some((row) => String(row.status) !== DRILL_STATUSES[0])) {
    return { ok: false, message: '只能选择「待排期」计划整组下发；已进入后续环节的计划不能混入' }
  }

  try {
    const organizer = requiredText(input.演练组织人, '演练组织人')
    const week = requiredText(input.排期周次, '排期周次')
    const missingCrew = selected.filter((row) => !String(row.参演班组 ?? '').trim())
    if (missingCrew.length) {
      return { ok: false, message: `有 ${missingCrew.length} 条计划缺失参演班组，请先补录班组再下发` }
    }
    const crews = new Set(selected.map((row) => String(row.参演班组 ?? '').trim()))
    if (crews.size !== 1) {
      return { ok: false, message: '同批只能下发给一个参演班组，请按班组分批选择' }
    }
    const crew = crews.values().next().value as string
    const quarters = new Set(selected.map((row) => String(row.演练季度)))
    if (quarters.size !== 1) {
      return { ok: false, message: '同批下发的计划须属于同一季度' }
    }
    const latest = [...rows]
      .map((row) => /-(\d{3})$/.exec(String(row.排期批次 ?? '')))
      .map((match) => (match ? Number(match[1]) : 0))
      .reduce((max, value) => Math.max(max, value), 0)
    const batchNo = `DR-${new Date().toISOString().slice(0, 10).split('-').join('')}-${String(latest + 1).padStart(3, '0')}`
    const selectedIds = new Set(ids)
    const next = rows.map((row) =>
      selectedIds.has(Number(row.id))
        ? {
            ...row,
            status: DRILL_STATUSES[1],
            pending: true,
            abnormal: false,
            参演班组: crew,
            演练组织人: organizer,
            排期周次: week,
            排期批次: batchNo,
          }
        : row,
    )
    saveRows(DRILL_MODULE_KEY, next)
    return { ok: true, message: `${selected.length} 条计划已整组下发给「${crew}」，批次 ${batchNo}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '排期下发失败' }
  }
}

export function implementDrillBatch(ids: number[], input: Record<string, string>): ActionResult {
  if (!ids.length) {
    return { ok: false, message: '请先勾选同一班组、同一批次的已排期计划' }
  }
  const rows = listRows(DRILL_MODULE_KEY)
  const selected = ids
    .map((id) => rows.find((row) => Number(row.id) === id))
    .filter((row): row is EntryRow => Boolean(row))
  if (selected.length !== ids.length) {
    return { ok: false, message: '所选演练计划有缺失，请刷新后重选' }
  }
  if (selected.some((row) => String(row.status) !== DRILL_STATUSES[1])) {
    return { ok: false, message: '班组落实只能处理「已排期」计划，不能越级或重复实施' }
  }
  try {
    const actualDate = requireDate(requiredText(input.实际日期, '实际日期'), '实际日期')
    const attendance = requiredText(input.班组到场情况, '班组到场情况')
    const attendeeCount = Number(input.参演人数)
    if (!Number.isInteger(attendeeCount) || attendeeCount <= 0) {
      return { ok: false, message: '参演人数须为大于 0 的整数' }
    }
    const crews = new Set(selected.map((row) => String(row.参演班组 ?? '').trim()))
    const batches = new Set(selected.map((row) => String(row.排期批次 ?? '').trim()))
    if (crews.size !== 1 || !crews.values().next().value) {
      return { ok: false, message: '参演班组缺失或同批选择了多个班组，已挡下' }
    }
    if (batches.size !== 1) {
      return { ok: false, message: '请按同一排期批次分批落实，不能跨批勾选' }
    }
    const notFullAttendance = attendance !== '全部到齐'
    const selectedIds = new Set(ids)
    const next = rows.map((row) =>
      selectedIds.has(Number(row.id))
        ? {
            ...row,
            status: DRILL_STATUSES[2],
            pending: true,
            abnormal: notFullAttendance,
            实际日期: actualDate,
            班组到场情况: attendance,
            参演人数: attendeeCount,
          }
        : row,
    )
    saveRows(DRILL_MODULE_KEY, next)
    return {
      ok: true,
      message: notFullAttendance
        ? `班组已落实，到场情况「${attendance}」已标为待关注`
        : '班组已按批次落实，参演班组全部到齐',
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '演练实施登记失败' }
  }
}

function syncDrillFollowUp(row: EntryRow): void {
  const sourceNo = String(row.演练编号)
  const serviceRows = listRows(HOUSEHOLD_SERVICE_KEY)
  if (serviceRows.some((item) => String(item.来源编号 ?? '') === sourceNo)) {
    return
  }
  const serviceId = nextStorageId(serviceRows)
  const followUp: EntryRow = {
    id: serviceId,
    status: '待回访',
    pending: true,
    abnormal: row.abnormal,
    服务单号: `HOUS-${String(serviceId).padStart(4, '0')}`,
    报修用户: String(row.参演班组 ?? ''),
    服务内容: `${String(row.演练主题)}评估结果回访`,
    受理人: String(row.评估人 ?? row.演练组织人 ?? ''),
    上门时间: String(row.评估日期 ?? ''),
    处理结果: `演练评估结论：${String(row.评估结论)}`,
    回访日期: '',
    来源编号: sourceNo,
    服务状态: '待回访',
  }
  saveRows(HOUSEHOLD_SERVICE_KEY, [...serviceRows, followUp])
}

export function approveDrillEvaluation(id: number, input: Record<string, string>): ActionResult {
  const rows = listRows(DRILL_MODULE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: '没有找到该演练计划' }
  }
  const row = rows[index]
  if (String(row.status) !== DRILL_STATUSES[2]) {
    return { ok: false, message: '只有「已实施」的演练才能由组织人核定评估结论' }
  }
  try {
    const conclusion = requiredText(input.评估结论, '评估结论')
    const summary = requiredText(input.评估说明, '评估说明')
    const evaluator = requiredText(input.评估人, '评估人')
    if (evaluator !== String(row.演练组织人 ?? '')) {
      return { ok: false, message: `评估结论须由演练组织人「${row.演练组织人}」核定` }
    }
    const evaluatedDate = requireDate(requiredText(input.评估日期, '评估日期'), '评估日期')
    const passed = conclusion.includes('优秀') || (conclusion.includes('合格') && !conclusion.includes('不合格'))
    const needsRework = conclusion.includes('整改') || conclusion.includes('复演') || conclusion.includes('不合格')
    const updated: EntryRow = {
      ...row,
      status: DRILL_STATUSES[3],
      pending: true,
      abnormal: row.abnormal || needsRework || !passed,
      评估结论: conclusion,
      评估说明: summary,
      评估人: evaluator,
      评估日期: evaluatedDate,
    }
    const next = [...rows]
    next[index] = updated
    saveRows(DRILL_MODULE_KEY, next)
    syncDrillFollowUp(updated)
    return { ok: true, message: `评估结论已由演练组织人 ${evaluator} 核定，并同步到客服待回来访清单` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '评估核定失败' }
  }
}

export function archiveDrillRecord(id: number, input: Record<string, string>): ActionResult {
  const rows = listRows(DRILL_MODULE_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: '没有找到该演练计划' }
  }
  const row = rows[index]
  if (String(row.status) !== DRILL_STATUSES[3]) {
    return { ok: false, message: '只有「已评估」的演练才能归档，未评估记录已挡下' }
  }
  try {
    const archiveNo = requiredText(input.归档编号, '归档编号')
    const archiveDate = requireDate(requiredText(input.归档日期, '归档日期'), '归档日期')
    if (rows.some((item) => Number(item.id) !== id && String(item.归档编号) === archiveNo)) {
      return { ok: false, message: `归档编号 ${archiveNo} 已存在` }
    }
    const updated: EntryRow = {
      ...row,
      status: DRILL_STATUSES[4],
      pending: false,
      归档编号: archiveNo,
      归档日期: archiveDate,
    }
    const next = [...rows]
    next[index] = updated
    saveRows(DRILL_MODULE_KEY, next)
    return { ok: true, message: `演练 ${row.演练编号} 已归档为 ${archiveNo}` }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : '演练归档失败' }
  }
}

export function listPendingDrillFollowUps(): EntryRow[] {
  return listRows(HOUSEHOLD_SERVICE_KEY).filter((row) =>
    String(row.来源编号 ?? '').startsWith('DRILL-') && String(row.status) === '待回访',
  )
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}
