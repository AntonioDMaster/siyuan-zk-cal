<script lang="ts">
    export let displayedMonth: Date;
    export let locale = "";
    export let onPrev: () => void;
    export let onNext: () => void;
    export let onToday: () => void;

    $: label = displayedMonth.toLocaleDateString(locale || undefined, { month: "long", year: "numeric" });
</script>

<div class="zk-cal__nav">
    <button class="b3-button b3-button--outline" on:click={onPrev}>&lt;</button>
    <div class="zk-cal__month">{label}</div>
    <button class="b3-button b3-button--outline" on:click={onToday}>Today</button>
    <button class="b3-button b3-button--outline" on:click={onNext}>&gt;</button>
</div>
