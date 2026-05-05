<script lang="ts">
  let { taskStatus = ' ' }: { taskStatus?: string } = $props()
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
