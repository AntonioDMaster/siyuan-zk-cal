<script lang="ts">
    import type { CalendarController } from "../controller";
    import type { CalendarCellData } from "../types";

    export let cell: CalendarCellData | null = null;
    export let controller: CalendarController | null = null;

    let noteName = "";

    $: if (cell && controller) {
        const dateKey = cell.date.getTime();
        noteName = "";
        controller.getRenderedDailyNoteName(cell.date).then((name) => {
            if (cell && cell.date.getTime() === dateKey) {
                noteName = name;
            }
        });
    } else {
        noteName = "";
    }

    $: detailsMetadata = cell ? (cell.metadata.details ?? []).filter((item) => item.label !== "streak") : [];
</script>

{#if cell}
    <div class="zk-cal__meta">
        <div class="zk-cal__meta-title">{noteName || controller?.getMetadataPopoverDate(cell.date) || cell.date.toLocaleDateString()}</div>
        {#if detailsMetadata.length > 0}
            {#each detailsMetadata as item}
                <div class="zk-cal__meta-row">
                    <span>{controller?.getMetadataPopoverLabel(item.label) ?? item.label}</span>
                    <span>{item.value}</span>
                </div>
            {/each}
        {:else}
            <div class="zk-cal__meta-row">{controller?.getMetadataPopoverEmptyText() ?? "No metadata"}</div>
        {/if}
    </div>
{/if}
