<template>
  <table id="cue-table">
    <thead>
      <tr>
        <th class="col-cuename">Cue name</th>
        <th class="col-dialog">Dialogue</th>
        <th class="col-status">Status/Prty</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="cuesStore.cues.length === 0">
        <td colspan="3" style="text-align:center; padding: 2rem; color: var(--text-muted)">
          No cues yet. Click + to add one.
        </td>
      </tr>
      <tr
        v-for="cue in cuesStore.cues"
        :key="cue.id"
        :class="{ selected: uiStore.selectedIds.has(cue.id) }"
      >
        <td>{{ cue.cue_name }}</td>
        <td>{{ cue.dialog }}</td>
        <td>{{ cue.status }}<br>{{ cue.priority }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
import { useCuesStore } from '../stores/cues'
import { useUiStore } from '../stores/ui'

const cuesStore = useCuesStore()
const uiStore = useUiStore()
</script>