<template>
  <section class="page" data-module="drillplan">
    <header class="page-head">
      <div>
        <h2>供热应急演练计划与评估台账</h2>
        <p class="page-desc">排期整组下发到参演班组，按计划、实施、评估、归档依次推进，越级操作一律拒收。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="exportRows">导出台账清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <p v-if="noticeMessage" class="ok-text">{{ noticeMessage }}</p>
    <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>

    <section class="stage-block">
      <h3>一、计划排期</h3>
      <p class="stage-desc">勾选多条待排期计划，一次整组下发到参演班组；参演班组缺失的先挡下，重复提交只记一次。</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>选择</th>
            <th>计划编号</th>
            <th>演练科目</th>
            <th>演练季度</th>
            <th>计划周次</th>
            <th>参演班组</th>
            <th>组织人</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in pendingPlans" :key="String(row.id)">
            <td><input v-model="selectedIds" type="checkbox" :value="Number(row.id)" /></td>
            <td>{{ row.计划编号 }}</td>
            <td>{{ row.演练科目 }}</td>
            <td>{{ row.演练季度 }}</td>
            <td>{{ row.计划周次 }}</td>
            <td :class="{ 'missing-team': teamsOf(row.参演班组).length === 0 }">
              {{ row.参演班组 || '（班组缺失，下发将被挡下）' }}
            </td>
            <td>{{ row.组织人 }}</td>
          </tr>
          <tr v-if="!pendingPlans.length">
            <td colspan="7" class="empty-state">暂无待排期的演练计划</td>
          </tr>
        </tbody>
      </table>
      <div class="stage-actions">
        <button class="btn primary" type="button" :disabled="!selectedIds.length" @click="dispatch">
          整组下发到参演班组（已选 {{ selectedIds.length }} 条）
        </button>
      </div>

      <h4>季度排期表</h4>
      <div v-for="slot in quarters" :key="slot.name" class="quarter-block">
        <h5>{{ slot.name }}（{{ slot.plans.length ? `${slot.plans.length} 条计划` : '无计划' }}）</h5>
        <table v-if="slot.plans.length" class="data-table">
          <thead>
            <tr>
              <th>计划编号</th>
              <th>演练科目</th>
              <th>计划周次</th>
              <th>参演班组</th>
              <th>下发批次</th>
              <th>当前状态</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in slot.plans" :key="String(row.id)">
              <td>{{ row.计划编号 }}</td>
              <td>{{ row.演练科目 }}</td>
              <td>{{ row.计划周次 }}</td>
              <td>{{ row.参演班组 || '—' }}</td>
              <td>{{ row.下发批次 || '—（既有做法）' }}</td>
              <td>{{ row.status }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="quarter-empty">
          <p v-if="slot.note" class="quarter-note">
            无计划说明：{{ slot.note.说明 }}（说明人：{{ slot.note.说明人 }}）
          </p>
          <form v-else class="quarter-note-form" @submit.prevent="saveNote(slot.name)">
            <span>本季度暂无演练计划，须单独说明、不留空壳：</span>
            <input v-model="noteDrafts[slot.name]" placeholder="填写本季度不安排演练的原因" />
            <button class="btn" type="submit">登记说明</button>
          </form>
        </div>
      </div>
    </section>

    <section class="stage-block">
      <h3>二、分批实施</h3>
      <p class="stage-desc">演练按班组分批落实，全部班组落实完成后自动转入已实施。</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>计划编号</th>
            <th>演练科目</th>
            <th>下发批次</th>
            <th>班组落实进度</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in scheduledPlans" :key="String(row.id)">
            <td>{{ row.计划编号 }}</td>
            <td>{{ row.演练科目 }}</td>
            <td>{{ row.下发批次 || '—（既有做法）' }}</td>
            <td>
              <span
                v-for="team in teamsOf(row.参演班组)"
                :key="team"
                class="team-chip"
                :class="{ done: isTeamDone(row, team) }"
              >
                {{ team }}{{ isTeamDone(row, team) ? '✓' : '' }}
              </span>
            </td>
            <td class="row-actions">
              <template v-for="team in teamsOf(row.参演班组)" :key="team">
                <button
                  v-if="!isTeamDone(row, team)"
                  class="link"
                  type="button"
                  @click="markTeamDone(row, team)"
                >
                  {{ team }}落实
                </button>
              </template>
            </td>
          </tr>
          <tr v-if="!scheduledPlans.length">
            <td colspan="5" class="empty-state">暂无已排期待实施的演练</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="stage-block">
      <h3>三、演练评估</h3>
      <p class="stage-desc">评估结论由演练组织人本人核定，核定后自动同步客服台账待回访清单。</p>
      <table class="data-table">
        <thead>
          <tr>
            <th>计划编号</th>
            <th>演练科目</th>
            <th>组织人</th>
            <th>评估结论</th>
            <th>核定</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in implementedPlans" :key="String(row.id)">
            <td>{{ row.计划编号 }}</td>
            <td>{{ row.演练科目 }}</td>
            <td>{{ row.组织人 }}</td>
            <td>
              <input v-model="evalDrafts[Number(row.id)]" placeholder="填写评估结论" />
            </td>
            <td class="row-actions">
              <input
                v-model="approverDrafts[Number(row.id)]"
                class="approver-input"
                placeholder="核定人（须为组织人）"
              />
              <button class="link" type="button" @click="approve(row)">核定评估</button>
            </td>
          </tr>
          <tr v-if="!implementedPlans.length">
            <td colspan="5" class="empty-state">暂无已实施待评估的演练</td>
          </tr>
        </tbody>
      </table>

      <h4>评估表（已核定，与排期表同源、计划对得上）</h4>
      <table class="data-table">
        <thead>
          <tr>
            <th>计划编号</th>
            <th>演练科目</th>
            <th>下发批次</th>
            <th>评估结论</th>
            <th>核定人</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in evaluatedPlans" :key="String(row.id)">
            <td>{{ row.计划编号 }}</td>
            <td>{{ row.演练科目 }}</td>
            <td>{{ row.下发批次 || '—（既有做法）' }}</td>
            <td>{{ row.评估结论 }}</td>
            <td>{{ row.核定人 }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="archive(row)">归档</button>
            </td>
          </tr>
          <tr v-if="!evaluatedPlans.length">
            <td colspan="6" class="empty-state">暂无已核定待归档的评估记录</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section class="stage-block">
      <h3>四、归档</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th>计划编号</th>
            <th>演练科目</th>
            <th>演练季度</th>
            <th>评估结论</th>
            <th>核定人</th>
            <th>当前状态</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in archivedPlans" :key="String(row.id)">
            <td>{{ row.计划编号 }}</td>
            <td>{{ row.演练科目 }}</td>
            <td>{{ row.演练季度 }}</td>
            <td>{{ row.评估结论 }}</td>
            <td>{{ row.核定人 }}</td>
            <td>{{ row.status }}</td>
          </tr>
          <tr v-if="!archivedPlans.length">
            <td colspan="6" class="empty-state">暂无已归档的演练记录</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>共 {{ rows.length }} 条演练计划</span>
      <span>评估结果同步客服台账（入户服务）待回访清单</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import { downloadEntries } from '@/api/local-service'
import {
  approveEvaluation,
  archivePlan,
  dispatchPlans,
  listDrills,
  quarterSchedule,
  recordTeamDone,
  saveQuarterNote,
  STAGE_ORDER,
  type QuarterSlot,
} from '@/api/drill-service'
import type { EntryRow } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()

const rows = ref<EntryRow[]>([])
const quarters = ref<QuarterSlot[]>([])
const selectedIds = ref<number[]>([])
const evalDrafts = ref<Record<number, string>>({})
const approverDrafts = ref<Record<number, string>>({})
const noteDrafts = ref<Record<string, string>>({})
const noticeMessage = ref('')
const errorMessage = ref('')

const stats = computed(() => [
  { label: '待排期计划', value: countByStatus('待排期') },
  { label: '实施中计划', value: countByStatus('已排期') },
  { label: '待评估演练', value: countByStatus('已实施') },
  { label: '已归档演练', value: countByStatus('已归档') },
])

const statusSummary = computed(() =>
  STAGE_ORDER.map((status) => ({ status, count: countByStatus(status) })),
)

const pendingPlans = computed(() => rows.value.filter((row) => row.status === '待排期'))
const scheduledPlans = computed(() => rows.value.filter((row) => row.status === '已排期'))
const implementedPlans = computed(() => rows.value.filter((row) => row.status === '已实施'))
const evaluatedPlans = computed(() => rows.value.filter((row) => row.status === '已评估'))
const archivedPlans = computed(() => rows.value.filter((row) => row.status === '已归档'))

function countByStatus(status: string): number {
  return rows.value.filter((row) => String(row.status) === status).length
}

function teamsOf(value: unknown): string[] {
  return String(value ?? '')
    .split(/[、,，;；\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function isTeamDone(row: EntryRow, team: string): boolean {
  return teamsOf(row.已落实班组).includes(team)
}

function applyResult(result: { ok: boolean; message: string }) {
  if (result.ok) {
    noticeMessage.value = result.message
    errorMessage.value = ''
    reload()
  } else {
    errorMessage.value = result.message
    noticeMessage.value = ''
  }
}

function dispatch() {
  applyResult(dispatchPlans(selectedIds.value))
  selectedIds.value = []
}

function markTeamDone(row: EntryRow, team: string) {
  applyResult(recordTeamDone(Number(row.id), team))
}

function approve(row: EntryRow) {
  const id = Number(row.id)
  applyResult(approveEvaluation(id, evalDrafts.value[id] ?? '', approverDrafts.value[id] ?? ''))
}

function archive(row: EntryRow) {
  applyResult(archivePlan(Number(row.id)))
}

function saveNote(quarter: string) {
  applyResult(saveQuarterNote(quarter, noteDrafts.value[quarter] ?? '', store.operator))
  noteDrafts.value = { ...noteDrafts.value, [quarter]: '' }
}

function exportRows() {
  downloadEntries('drillplan')
}

function reload() {
  rows.value = listDrills()
  quarters.value = quarterSchedule()
}

onMounted(reload)
</script>
