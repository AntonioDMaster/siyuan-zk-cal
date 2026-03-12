<script lang="ts">
    export let number: number;
    export let onClick: (event: MouseEvent) => void;
    export let onContext: (event: MouseEvent) => void;
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<button class="zk-cal__weeknum" on:click={onClick} on:contextmenu={onContext}>
    W{String(number).padStart(2, "0")}
</button>
