<script lang="ts">
  // export let checked = false
  export let taskStatus = ' '
</script>

<label class="task-list-label">
  <input
    type="checkbox"
    class="task-list-item-checkbox"
    data-task={taskStatus}
    checked={taskStatus !== ' '}
    readonly
  />
</label>

<style>
  .task-list-label {
    display: flex;
    align-items: center;
  }
</style>
