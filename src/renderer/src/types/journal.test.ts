import { describe, it, expect } from "vitest";
import { VERSION_NUMBER, SENTIMENT_COLORS } from "./journal";

describe("journal constants", () => {
    it("VERSION_NUMBER is 7.0 for the current format", () => {
        expect(VERSION_NUMBER).toBe(7.0);
    });

    it("SENTIMENT_COLORS covers every sentiment plus Unknown", () => {
        expect(Object.keys(SENTIMENT_COLORS).sort()).toEqual(
            [
                "Angry",
                "Excited",
                "Happy",
                "Loved",
                "Neutral",
                "Sad",
                "Unknown",
            ].sort(),
        );
    });
});
