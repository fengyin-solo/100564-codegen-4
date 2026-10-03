<template>
  <section class="page drill-page" data-module="emergencydrill">
    <header class="page-head">
      <div>
        <h2>供热应急演练计划与评估台账</h2>
        <p class="page-desc">
          按计划、排期、实施、评估、归档逐级推进；排期可一次多选整组下发，季度无计划须单独说明。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出台账</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <div class="tab-bar">
      <button
        v-for="tab in tabs"
        :key="tab.key"
        class="tab-btn"
        :class="{ active: activeTab === tab.key }"
        type="button"
        @click="activeTab = tab.key"
      >
        {{ tab.label }}
      </button>
    </div>

    <p v-if="message" class="notice" :class="{ error: !messageOk }">{{ message }}</p>

    <div v-if="activeTab === 'plan'" class="panel-grid">
      <form class="form-card" @submit.prevent="submitPlan">
        <h3>登记演练计划</h3>
        <label>
          <span>演练主题</span>
          <input v-model="planForm.演练主题" placeholder="如：一次网突发泄漏处置" />
        </label>
        <label>
          <span>演练类型/既有做法</span>
          <input v-model="planForm.演练类型" list="drill-types" placeholder="桌面推演、现场实战或专项演练" />
          <datalist id="drill-types">
            <option value="桌面推演"></option>
            <option value="现场实战演练"></option>
            <option value="桌面推演结合现场拉动"></option>
            <option value="供热前综合演练"></option>
            <option value="专项演练"></option>
          </datalist>
        </label>
        <label>
          <span>计划日期</span>
          <input v-model="planForm.计划日期" type="date" />
        </label>
        <label>
          <span>参演班组</span>
          <input v-model="planForm.参演班组" placeholder="排期前必须明确" />
        </label>
        <label>
          <span>演练组织人</span>
          <input v-model="planForm.演练组织人" placeholder="后续由其核定评估" />
        </label>
        <button class="btn primary" type="submit">保存计划</button>
      </form>

      <form class="form-card" @submit.prevent="submitNote">
        <h3>某季度无计划说明</h3>
        <p class="form-hint">没有计划的季度不建空壳记录，在这里单独说明原因。</p>
        <label>
          <span>演练季度</span>
          <input v-model="noteForm.演练季度" list="quarter-options" placeholder="YYYY-Qn" />
          <datalist id="quarter-options">
            <option v-for="quarter in quarterOptions" :key="quarter" :value="quarter"></option>
          </datalist>
        </label>
        <label>
          <span>无计划原因</span>
          <textarea v-model="noteForm.说明" rows="3" placeholder="说明该季度为什么不安排演练"></textarea>
        </label>
        <label>
          <span>登记人</span>
          <input v-model="noteForm.登记人" />
        </label>
        <label>
          <span>登记日期</span>
          <input v-model="noteForm.登记日期" type="date" />
        </label>
        <button class="btn primary" type="submit">登记说明</button>
      </form>
    </div>

    <div v-if="activeTab === 'plan'" class="note-strip">
      <strong>季度覆盖：</strong>
      <span v-for="item in quarterCoverage" :key="item.quarter" class="note-pill" :class="{ blank: !item.planned && !item.note }">
        {{ item.quarter }}：{{ item.note ? item.note.说明 : item.planned ? `已列 ${item.planned} 项计划` : '尚未说明' }}
      </span>
    </div>

    <template v-if="activeTab === 'schedule'">
      <form class="batch-card" @submit.prevent="submitDispatch">
        <h3>整组下发排期</h3>
        <p class="form-hint">勾选同一班组、同一季度的多条待排期计划；重复提交同一批次只记一次。</p>
        <label>
          <span>排期周次</span>
          <input v-model="dispatchForm.排期周次" placeholder="如：2026-W42" />
        </label>
        <label>
          <span>演练组织人</span>
          <input v-model="dispatchForm.演练组织人" />
        </label>
        <button class="btn primary" type="submit" :disabled="!dispatchIds.length">
          下发已选 {{ dispatchIds.length }} 条
        </button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>选择</th>
            <th v-for="column in scheduleColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>班组补录</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in planRows" :key="String(row.id)">
            <td>
              <input
                :checked="isSelected(Number(row.id), dispatchIds)"
                :disabled="String(row.status) !== '待排期'"
                type="checkbox"
                @change="dispatchIds = toggleId(Number(row.id), dispatchIds, $event, () => fillDispatchForm(row))"
              />
            </td>
            <td v-for="column in scheduleColumns" :key="column">{{ row[column] || '—' }}</td>
            <td>{{ row.status }}</td>
            <td>
              <button v-if="!row.参演班组" class="link" type="button" @click="openCrewForm(Number(row.id))">
                补录参演班组
              </button>
              <span v-else>已明确</span>
            </td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-if="activeTab === 'implement'">
      <form class="batch-card" @submit.prevent="submitImplement">
        <h3>班组分批落实</h3>
        <p class="form-hint">只能勾选同一参演班组、同一排期批次的「已排期」计划。</p>
        <div class="form-row">
          <label>
            <span>实际日期</span>
            <input v-model="implementForm.实际日期" type="date" />
          </label>
          <label>
            <span>班组到场情况</span>
            <input v-model="implementForm.班组到场情况" list="attendance-options" />
            <datalist id="attendance-options">
              <option value="全部到齐"></option>
              <option value="部分班组未按时到齐"></option>
              <option value="请假1人，其余到齐"></option>
            </datalist>
          </label>
          <label>
            <span>参演人数</span>
            <input v-model.number="implementForm.参演人数" type="number" min="1" />
          </label>
        </div>
        <button class="btn primary" type="submit" :disabled="!implementIds.length">
          落实已选 {{ implementIds.length }} 条
        </button>
      </form>

      <table class="data-table">
        <thead>
          <tr>
            <th>选择</th>
            <th v-for="column in implementColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in scheduledRows" :key="String(row.id)">
            <td>
              <input
                :checked="isSelected(Number(row.id), implementIds)"
                type="checkbox"
                @change="implementIds = toggleId(Number(row.id), implementIds, $event)"
              />
            </td>
            <td v-for="column in implementColumns" :key="column">{{ row[column] || '—' }}</td>
            <td>{{ row.status }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-if="activeTab === 'evaluate'">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in evaluateColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>评估核定</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in evaluableRows" :key="String(row.id)">
            <td v-for="column in evaluateColumns" :key="column">{{ row[column] || '—' }}</td>
            <td>{{ row.status }}</td>
            <td>
              <button class="btn primary" type="button" @click="openEvaluation(row)">核定评估结论</button>
            </td>
          </tr>
          <tr v-if="!evaluableRows.length">
            <td :colspan="evaluateColumns.length + 2" class="empty-state">暂无已实施待评估演练</td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-if="activeTab === 'archive'">
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in archiveColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>归档</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in evaluatedRows" :key="String(row.id)">
            <td v-for="column in archiveColumns" :key="column">{{ row[column] || '—' }}</td>
            <td>{{ row.status }}</td>
            <td>
              <button class="btn primary" type="button" @click="openArchive(row)">完成归档</button>
            </td>
          </tr>
          <tr v-if="!evaluatedRows.length">
            <td :colspan="archiveColumns.length + 2" class="empty-state">暂无已评估待归档演练</td>
          </tr>
        </tbody>
      </table>
    </template>

    <template v-if="activeTab === 'followup'">
      <h3>客服台账：待回来访清单</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in followUpColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>回访</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in followUpRows" :key="String(row.id)">
            <td v-for="column in followUpColumns" :key="column">{{ row[column] || '—' }}</td>
            <td>{{ row.status }}</td>
            <td><button class="link" type="button" @click="completeFollowUp(row)">完成回访</button></td>
          </tr>
          <tr v-if="!followUpRows.length">
            <td :colspan="followUpColumns.length + 2" class="empty-state">暂无演练评估同步的待回来访</td>
          </tr>
        </tbody>
      </table>
    </template>

    <div v-if="activeTab !== 'followup'" class="ledger-block">
      <h3>统一演练台账（排期表与评估表共用同一计划编号）</h3>
      <table class="data-table compact">
        <thead>
          <tr>
            <th v-for="column in ledgerColumns" :key="column">{{ column }}</th>
            <th>当前状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="String(row.id)">
            <td v-for="column in ledgerColumns" :key="column">{{ row[column] || '—' }}</td>
            <td>{{ row.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <dialog ref="crewDialogRef" class="dialog">
      <form method="dialog" class="dialog-card" @submit.prevent="submitCrew">
        <h3>补录参演班组</h3>
        <label>
          <span>参演班组</span>
          <input v-model="crewForm.参演班组" placeholder="如：维修二班" />
        </label>
        <menu>
          <button class="btn" value="cancel" @click="cancelCrewDialog">取消</button>
          <button class="btn primary" type="submit">保存</button>
        </menu>
      </form>
    </dialog>

    <dialog ref="evaluationDialogRef" class="dialog">
      <form method="dialog" class="dialog-card" @submit.prevent="submitEvaluation">
        <h3>核定演练评估</h3>
        <p class="form-hint">{{ evaluationForm.演练编号 }} · 组织人须为 {{ evaluationForm.演练组织人 }}</p>
        <label>
          <span>评估结论</span>
          <input v-model="evaluationForm.评估结论" list="conclusion-options" />
          <datalist id="conclusion-options">
            <option value="合格"></option>
            <option value="优秀"></option>
            <option value="需整改后复演"></option>
            <option value="不合格"></option>
          </datalist>
        </label>
        <label>
          <span>评估说明</span>
          <textarea v-model="evaluationForm.评估说明" rows="3"></textarea>
        </label>
        <label>
          <span>评估人（演练组织人）</span>
          <input v-model="evaluationForm.评估人" />
        </label>
        <label>
          <span>评估日期</span>
          <input v-model="evaluationForm.评估日期" type="date" />
        </label>
        <menu>
          <button class="btn" value="cancel" @click="cancelEvaluationDialog">取消</button>
          <button class="btn primary" type="submit">核定并同步客服</button>
        </menu>
      </form>
    </dialog>

    <dialog ref="archiveDialogRef" class="dialog">
      <form method="dialog" class="dialog-card" @submit.prevent="submitArchive">
        <h3>演练归档</h3>
        <label>
          <span>归档编号</span>
          <input v-model="archiveForm.归档编号" placeholder="如：YLDG-2026-008" />
        </label>
        <label>
          <span>归档日期</span>
          <input v-model="archiveForm.归档日期" type="date" />
        </label>
        <menu>
          <button class="btn" value="cancel" @click="cancelArchiveDialog">取消</button>
          <button class="btn primary" type="submit">确认归档</button>
        </menu>
      </form>
    </dialog>

    <footer class="page-foot">
      <span>共 {{ rows.length }} 条计划、{{ notes.length }} 条季度无计划说明</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
type ToggleTarget = { checked: boolean }

import {
  approveDrillEvaluation,
  archiveDrillRecord,
  createDrillPlan,
  createQuarterNoPlanNote,
  dispatchDrillSchedules,
  downloadEntries,
  implementDrillBatch,
  listDrillQuarterNotes,
  listEntries,
  listPendingDrillFollowUps,
  moduleMeta,
  runAction,
  updateDrillCrew,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('emergencydrill')
const today = '2026-10-03'
const tabs = [
  { key: 'plan', label: '计划/无计划说明' },
  { key: 'schedule', label: '排期下发' },
  { key: 'implement', label: '班组实施' },
  { key: 'evaluate', label: '评估核定' },
  { key: 'archive', label: '归档' },
  { key: 'followup', label: '客服待回来访' },
] as const

type TabKey = (typeof tabs)[number]['key']

const activeTab = ref<TabKey>('plan')
const rows = ref<EntryRow[]>([])
const notes = ref<EntryRow[]>([])
const followUpRows = ref<EntryRow[]>([])
const message = ref('')
const messageOk = ref(true)

const scheduleColumns = ['演练编号', '演练主题', '演练季度', '排期周次', '计划日期', '参演班组', '演练组织人', '排期批次']
const implementColumns = ['演练编号', '演练主题', '参演班组', '排期批次', '计划日期', '演练组织人']
const evaluateColumns = ['演练编号', '演练主题', '参演班组', '实际日期', '班组到场情况', '参演人数', '演练组织人']
const archiveColumns = ['演练编号', '演练主题', '评估结论', '评估说明', '评估人', '评估日期']
const followUpColumns = ['服务单号', '来源编号', '报修用户', '服务内容', '处理结果', '受理人']
const ledgerColumns = ['演练编号', '演练主题', '演练季度', '排期周次', '参演班组', '排期批次', '实际日期', '评估结论', '归档编号']

function emptyPlanForm() {
  return { 演练主题: '', 演练类型: '现场实战演练', 计划日期: '', 参演班组: '', 演练组织人: '' }
}
function emptyNoteForm() {
  return { 演练季度: '2026-Q3', 说明: '', 登记人: '值班管理员', 登记日期: today }
}

const planForm = ref(emptyPlanForm())
const noteForm = ref(emptyNoteForm())
const dispatchForm = ref({ 排期周次: '', 演练组织人: '' })
const implementForm = ref({ 实际日期: '', 班组到场情况: '全部到齐', 参演人数: 0 })
const dispatchIds = ref<number[]>([])
const implementIds = ref<number[]>([])
const crewDialogRef = ref<HTMLDialogElement | null>(null)
const evaluationDialogRef = ref<HTMLDialogElement | null>(null)
const archiveDialogRef = ref<HTMLDialogElement | null>(null)
const crewForm = ref<{ id: number; 参演班组: string }>({ id: 0, 参演班组: '' })
const evaluationForm = ref<Record<string, string>>({})
const archiveForm = ref<{ id: number; 归档编号: string; 归档日期: string }>({ id: 0, 归档编号: '', 归档日期: today })

const quarterOptions = ['2026-Q1', '2026-Q2', '2026-Q3', '2026-Q4']

const stats = computed(() => [
  { label: '待排期计划', value: rows.value.filter((row) => row.status === '待排期').length },
  { label: '已排期计划', value: rows.value.filter((row) => row.status === '已排期').length },
  { label: '待评估演练', value: rows.value.filter((row) => row.status === '已实施').length },
  { label: '已归档演练', value: rows.value.filter((row) => row.status === '已归档').length },
])

const planRows = computed(() => rows.value.filter((row) => ['待排期', '已排期'].includes(String(row.status))))
const scheduledRows = computed(() => rows.value.filter((row) => String(row.status) === '已排期'))
const evaluableRows = computed(() => rows.value.filter((row) => String(row.status) === '已实施'))
const evaluatedRows = computed(() => rows.value.filter((row) => String(row.status) === '已评估'))

const quarterCoverage = computed(() =>
  quarterOptions.map((quarter) => {
    const planned = rows.value.filter((row) => String(row.演练季度) === quarter).length
    const note = notes.value.find((item) => String(item.演练季度) === quarter)
    return { quarter, planned, note }
  }),
)

function setNotice(result: { ok: boolean; message: string }) {
  messageOk.value = result.ok
  message.value = result.message
}

function isSelected(id: number, selected: number[]) {
  return selected.includes(id)
}

function toggleId(
  id: number,
  selected: number[],
  event: Event,
  onAdd?: () => void,
) {
  const checked = (event.target as unknown as ToggleTarget).checked
  if (checked) {
    onAdd?.()
    return [...selected, id]
  }
  return selected.filter((item: number) => item !== id)
}

function weekFromDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`)
  const day = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

function fillDispatchForm(row: EntryRow) {
  if (!dispatchForm.value.演练组织人) {
    dispatchForm.value.演练组织人 = String(row.演练组织人 ?? '')
  }
  if (!dispatchForm.value.排期周次 && row.计划日期) {
    dispatchForm.value.排期周次 = weekFromDate(String(row.计划日期))
  }
}

function exportRows() {
  downloadEntries(meta.key)
}

function closeDialog(dialog: HTMLDialogElement | null) {
  dialog?.close()
}

function cancelCrewDialog() {
  closeDialog(crewDialogRef.value)
}

function cancelEvaluationDialog() {
  closeDialog(evaluationDialogRef.value)
}

function cancelArchiveDialog() {
  closeDialog(archiveDialogRef.value)
}

function openDialog(dialog: HTMLDialogElement | null) {
  dialog?.showModal()
}

function submitPlan() {
  setNotice(createDrillPlan(planForm.value as unknown as Record<string, string>))
  if (messageOk.value) {
    planForm.value = emptyPlanForm()
  }
  reload()
}

function submitNote() {
  setNotice(createQuarterNoPlanNote(noteForm.value))
  if (messageOk.value) {
    noteForm.value = emptyNoteForm()
  }
  reload()
}

function submitDispatch() {
  setNotice(dispatchDrillSchedules(dispatchIds.value, dispatchForm.value))
  if (messageOk.value) {
    dispatchIds.value = []
    dispatchForm.value = { 排期周次: '', 演练组织人: '' }
  }
  reload()
}

function submitImplement() {
  setNotice(implementDrillBatch(implementIds.value, implementForm.value as unknown as Record<string, string>))
  if (messageOk.value) {
    implementIds.value = []
    implementForm.value = { 实际日期: '', 班组到场情况: '全部到齐', 参演人数: 0 }
  }
  reload()
}

function openCrewForm(id: number) {
  crewForm.value = { id, 参演班组: '' }
  openDialog(crewDialogRef.value)
}

function submitCrew() {
  setNotice(updateDrillCrew(crewForm.value.id, crewForm.value.参演班组))
  closeDialog(crewDialogRef.value)
  reload()
}

function openEvaluation(row: EntryRow) {
  evaluationForm.value = {
    id: String(row.id),
    演练编号: String(row.演练编号),
    演练组织人: String(row.演练组织人),
    评估结论: '',
    评估说明: '',
    评估人: String(row.演练组织人),
    评估日期: today,
  }
  openDialog(evaluationDialogRef.value)
}

function submitEvaluation() {
  const payload = Object.fromEntries(
    Object.entries(evaluationForm.value).filter(([key]) => key !== 'id' && key !== '演练编号' && key !== '演练组织人'),
  )
  setNotice(approveDrillEvaluation(Number(evaluationForm.value.id), payload))
  closeDialog(evaluationDialogRef.value)
  reload()
}

function openArchive(row: EntryRow) {
  archiveForm.value = {
    id: Number(row.id),
    归档编号: `YLDG-${String(row.演练编号 ?? '').slice(-3)}`,
    归档日期: today,
  }
  openDialog(archiveDialogRef.value)
}

function submitArchive() {
  const { id, ...payload } = archiveForm.value
  setNotice(archiveDrillRecord(id, payload))
  closeDialog(archiveDialogRef.value)
  reload()
}

function completeFollowUp(row: EntryRow) {
  setNotice(runAction('householdservice', Number(row.id), '完成回访'))
  reload()
}

function reload() {
  const payload = listEntries(meta.key)
  rows.value = payload.items
  notes.value = listDrillQuarterNotes()
  followUpRows.value = listPendingDrillFollowUps()
}

onMounted(reload)
</script>

<style scoped>
.tab-bar { display: flex; gap: 8px; margin-bottom: 12px; flex-wrap: wrap; }
.tab-btn { border: 1px solid var(--border); background: #fff; border-radius: 999px; padding: 6px 14px; cursor: pointer; }
.tab-btn.active { background: var(--brand); border-color: var(--brand); color: #fff; }
.panel-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.form-card, .batch-card, .ledger-block { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 12px; margin-bottom: 12px; }
.form-card h3, .batch-card h3, .ledger-block h3 { margin: 0 0 10px; font-size: 15px; }
.form-card label, .dialog-card label { display: block; margin-bottom: 10px; font-size: 12px; color: var(--muted); }
.form-card input, .form-card textarea, .batch-card input, .dialog-card input, .dialog-card textarea { width: 100%; margin-top: 4px; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px; color: #1f2937; }
.form-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
.form-hint { font-size: 12px; color: var(--muted); margin: 0 0 10px; }
.note-strip { display: flex; gap: 8px; flex-wrap: wrap; background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 10px; margin-bottom: 12px; }
.note-pill { background: #eef2ff; border-radius: 999px; padding: 3px 10px; font-size: 12px; }
.note-pill.blank { background: #fff7ed; color: #9a3412; }
.notice { background: #ecfdf3; border: 1px solid #abefc6; color: #067647; border-radius: 6px; padding: 8px 10px; }
.notice.error { background: #fef3f2; border-color: #fda29b; color: #b42318; }
.data-table.compact { font-size: 12px; }
.dialog { border: none; border-radius: 10px; padding: 0; width: min(520px, calc(100vw - 32px)); }
.dialog::backdrop { background: rgba(15, 23, 42, 0.45); }
.dialog-card { padding: 18px; margin: 0; }
.dialog-card h3 { margin-top: 0; }
.dialog-card menu { display: flex; justify-content: flex-end; gap: 8px; padding: 0; margin: 0; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
