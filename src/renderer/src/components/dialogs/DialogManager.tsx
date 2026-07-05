import { NewJournalDialog } from "./NewJournalDialog";
import { DecryptDialog } from "./DecryptDialog";
import { AboutDialog } from "./AboutDialog";
import { ErrorDialog } from "./ErrorDialog";
import { IntroDialog } from "./IntroDialog";
import { SearchDialog } from "./SearchDialog";
import { StatisticsDialog } from "./StatisticsDialog";
import { EditEntryDialog } from "./EditEntryDialog";

export function DialogManager() {
    return (
        <>
            <NewJournalDialog />
            <DecryptDialog />
            <AboutDialog />
            <ErrorDialog />
            <IntroDialog />
            <SearchDialog />
            <StatisticsDialog />
            <EditEntryDialog />
        </>
    );
}
