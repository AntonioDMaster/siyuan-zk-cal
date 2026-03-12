<script lang="ts">
    import { createEventDispatcher, onMount } from "svelte";
    import type { CalendarController } from "../controller";
    import type { CalendarCellData } from "../types";
    import Day from "./Day.svelte";
    import MetadataPopover from "./MetadataPopover.svelte";
    import Nav from "./Nav.svelte";
    import WeekNum from "./WeekNum.svelte";

    export let controller: CalendarController;
    export let refreshSignal = 0;
export let layoutVersion = 0;

    const dispatch = createEventDispatcher();

    let displayedMonth = new Date();
    let weeks: CalendarCellData[][] = [];
    let weekNumbers: number[] = [];
    let weekdayLabels: string[] = [];
    let displayLocale = navigator.language;
    let hoverCell: CalendarCellData | null = null;
    let loading = false;
    let seenRefreshSignal = -1;
    let loadRequestId = 0;

    onMount(async () => {
        await loadMonth();
    });

    $: if (refreshSignal !== seenRefreshSignal) {
        seenRefreshSignal = refreshSignal;
        loadMonth();
    }

    async function loadMonth() {
        const requestId = ++loadRequestId;
        loading = true;
        try {
            const data = await controller.buildMonthCells(displayedMonth);
            if (requestId !== loadRequestId) {
                return;
            }
            displayLocale = controller.getDisplayLocale();
            weeks = data.weeks;
            weekNumbers = data.weekNumbers;
            weekdayLabels = controller.getDaysOfWeek(displayLocale);
        } finally {
            if (requestId === loadRequestId) {
                loading = false;
            }
        }
    }

    function previousMonth() {
        displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() - 1, 1);
        loadMonth();
    }

    function nextMonth() {
        displayedMonth = new Date(displayedMonth.getFullYear(), displayedMonth.getMonth() + 1, 1);
        loadMonth();
    }

    function goToday() {
        displayedMonth = new Date();
        loadMonth();
    }

    export async function revealDate(date: Date) {
        displayedMonth = new Date(date.getFullYear(), date.getMonth(), 1);
        await loadMonth();
    }

    async function onDayClick(cell: CalendarCellData) {
        dispatch("dayClick", { cell });
    }

    function onDayContext(cell: CalendarCellData, event: MouseEvent) {
        event.preventDefault();
        dispatch("dayContext", { cell, event });
    }

    function onWeekClick(weekDate: Date) {
        dispatch("weekClick", { weekDate });
    }

    function onWeekContext(weekDate: Date, event: MouseEvent) {
        event.preventDefault();
        dispatch("weekContext", { weekDate, event });
    }
</script>

<div class="zk-cal">
    <Nav displayedMonth={displayedMonth} locale={displayLocale} onPrev={previousMonth} onNext={nextMonth} onToday={goToday} />
    {#if weeks.length === 0}
        <div class="zk-cal__loading">Loading...</div>
    {:else}
        {#key layoutVersion}
            <div class="zk-cal__grid" class:zk-cal__grid--loading={loading}>
                <div
                    class="zk-cal__grid-head"
                    style={`grid-template-columns: repeat(${controller.settings.showWeekNumbers ? 8 : 7}, minmax(0, 1fr));`}
                >
                {#if controller.settings.showWeekNumbers}
                    <div class="zk-cal__head zk-cal__head--week">W</div>
                {/if}
                {#each weekdayLabels as label}
                    <div class="zk-cal__head">{label}</div>
                {/each}
                </div>
                <div class="zk-cal__grid-body">
                {#each weeks as week, index}
                    <div
                        class="zk-cal__week-row"
                        style={`grid-template-columns: repeat(${controller.settings.showWeekNumbers ? 8 : 7}, minmax(0, 1fr));`}
                    >
                        {#if controller.settings.showWeekNumbers}
                            <WeekNum
                                number={weekNumbers[index]}
                                onClick={() => onWeekClick(week[0].date)}
                                onContext={(event) => onWeekContext(week[0].date, event)}
                            />
                        {/if}
                        {#each week as cell}
                            <Day
                                {cell}
                                onClick={(target) => onDayClick(target)}
                                onContext={onDayContext}
                                onHover={(target) => {
                                    hoverCell = target;
                                }}
                            />
                        {/each}
                    </div>
                {/each}
                </div>
            </div>
        {/key}
    {/if}
    <MetadataPopover cell={hoverCell} controller={controller} />
</div>
