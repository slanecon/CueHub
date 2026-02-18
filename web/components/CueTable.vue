<template>
  <table id="cue-table">
    <thead>
      <tr>
        <th class="col-reel">Reel</th>
        <th class="col-scene">Scene</th>
        <th class="col-cuename">Cue name</th>
        <th class="col-time">Start/End</th>
        <th class="col-character">Character</th>
        <th class="col-dialog">Dialogue</th>
        <th class="col-notes">All notes</th>
        <th class="col-status">Status/Prty</th>
      </tr>
    </thead>
    <tbody>
      <tr v-if="cuesStore.cues.length === 0">
        <td colspan="8" style="text-align:center; padding: 2rem; color: var(--text-muted)">
          No cues yet. Click + to add one.
        </td>
      </tr>
      <tr
        v-for="cue in cuesStore.cues"
        :key="cue.id"
        :class="{ selected: uiStore.selectedIds.has(cue.id) }"
      >
        <td>{{ cue.reel }}</td>
        <td>{{ cue.scene }}</td>
        <td>{{ cue.cue_name }}</td>
        <td>{{ cue.start_time }}<br>{{ cue.end_time }}</td>
        <td>{{ cue.character_name }}</td>
        <td>{{ cue.dialog }}</td>
        <td>{{ cue.notes }}</td>
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