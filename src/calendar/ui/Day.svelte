<script lang="ts">
    import type { CalendarCellData } from "../types";

    export let cell: CalendarCellData;
    export let onClick: (cell: CalendarCellData, event: MouseEvent) => void;
    export let onContext: (cell: CalendarCellData, event: MouseEvent) => void;
    export let onHover: (cell: CalendarCellData) => void;
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<button
    class="zk-cal__day"
    class:zk-cal__day--muted={!cell.isCurrentMonth}
    class:zk-cal__day--today={cell.isToday}
    class:zk-cal__day--hasnote={!!cell.dailyDoc}
    on:click={(event) => onClick(cell, event)}
    on:contextmenu={(event) => onContext(cell, event)}
    on:mouseenter={() => onHover(cell)}
>
    <span>{cell.date.getDate()}</span>
    <span class="zk-cal__dots">
        {#each cell.metadata.dots ?? [] as dot}
            <i
                class="zk-cal__dot"
                class:zk-cal__dot--hollow={dot.type === "hollow"}
                class:zk-cal__dot--dotted={dot.type === "dotted"}
            ></i>
        {/each}
    </span>
</button>
