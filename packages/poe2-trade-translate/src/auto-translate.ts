import type { Response as PlaywrightResponse } from "playwright";
import type { Awaitable } from "@crawlee/types";
import { CheerioCrawler, type LoadedRequest, PlaywrightCrawler, ProxyConfiguration, type RequestOptions, type Request, type RequestHandler, type CheerioCrawlerOptions, type CheerioCrawlingContext } from "crawlee";
import { readTexts, type TextData, writeTexts } from "./share.js";

const texts = readTexts()!;

interface PoeDbSearchTranslateHandler {
    isMatch(text: TextData): boolean;
    
    getSearchText(text: TextData): string | undefined;
    
    handleTranslate(context: CheerioCrawlingContext): Awaitable<string | undefined | void>;
}

const poeDbReplaceCharMap = new Map([
    [" ", "_"],
    ["'", ""],
    ["(", "%28"],
    [")", "%29"],
]);

const replaceCharRegex = new RegExp(`[${[...poeDbReplaceCharMap.keys()].join("")}]`, "g");

async function translateByPoeDbAutoComplete() {
    const crawler = new PlaywrightCrawler({
        // maxConcurrency: 1,
        proxyConfiguration: new ProxyConfiguration({
            proxyUrls: ["http://127.0.0.1:10808"], // 你的本地代理地址
        }),
        async requestHandler({ page, request, log }) {
            const responsePromise = new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => {
                    page.off("response", onResponse);
                    reject(new Error("Timed out waiting for autocompletecb_tw"));
                }, 30_000);
                
                log.info("Waiting for autocompletecb_tw response...");
                
                const onResponse = async (response: PlaywrightResponse) => {
                    try {
                        if (!response.url().includes("autocompletecb_tw")) {
                            return;
                        }
                        
                        log.info("Captured autocompletecb_tw");
                        
                        const autocompleteList = await response.json();
                        
                        const autoCompleteMap = new Map<string, string>();
                        
                        for (const autoCompleteData of autocompleteList) {
                            autoCompleteMap.set(autoCompleteData.value, autoCompleteData.label);
                        }
                        
                        for (const text of Object.values(texts)) {
                            const searchText = text.original.replace(replaceCharRegex, (c) => (poeDbReplaceCharMap.get(c) ?? c));
                            const autoCompleteText = autoCompleteMap.get(searchText);
                            if (autoCompleteText) {
                                text.translate = autoCompleteText;
                                console.log("translate by auto complete", text.original, "=>", text.translate);
                            }
                        }
                        
                        // log.info(body);
                        clearTimeout(timeout);
                        page.off("response", onResponse);
                        resolve();
                    }
                    catch (error) {
                        clearTimeout(timeout);
                        page.off("response", onResponse);
                        reject(error);
                    }
                };
                
                page.on("response", onResponse);
            });
            
            await page.goto(request.url, { waitUntil: "domcontentloaded" });
            await responsePromise;
        },
    });
    
    await crawler.run(["https://poe2db.tw/tw/"]);
}

const boeDbSearchTranslateHandlers: PoeDbSearchTranslateHandler[] = [
    {
        isMatch(text: TextData): boolean {
            return text.key.startsWith("items");
        },
        getSearchText(text: TextData): string | undefined {
            return text.original;
        },
        handleTranslate: ({ $ }) => {
            const tabName = $("[data-tabname]")?.attr("data-tabname");
            if (tabName) {
                return tabName.replace(/\s*<small>.*<\/small>\s*/i, "").trim();
            }
        }
    },
    {
        isMatch(text: TextData): boolean {
            return text.key.startsWith("stats") && text.original.startsWith("Allocates ");
        },
        getSearchText(text: TextData): string | undefined {
            return text.original.replace("Allocates ", "");
        },
        handleTranslate: ({ $ }) => {
            const name = $(`meta[property="og:title"]`)?.attr("content")?.trim();
            if (name) {
                return "配置 " + name;
            }
        }
    }
];

function getPoeDbSearchTranslateHandler(text: TextData): PoeDbSearchTranslateHandler | undefined {
    return boeDbSearchTranslateHandlers.find(h => h.isMatch(text));
}

async function translateByPoeDbSearch() {
    const requests: RequestOptions[] = [];
    
    const crawler = new CheerioCrawler({
        maxConcurrency: 20,
        // maxRequestsPerMinute: 30,
        proxyConfiguration: new ProxyConfiguration({
            proxyUrls: ["http://127.0.0.1:10808"], // 你的本地代理地址
        }),
        async requestHandler(context) {
            const { log, request } = context;
            const text = texts[request.userData.key]!;
            log.info("Handling search page for: " + request.url);
            const handler = getPoeDbSearchTranslateHandler(text);
            if (handler) {
                const translate = await handler.handleTranslate(context);
                if (translate) {
                    text.translate = translate;
                    console.log("translate by search", text.original, "=>", text.translate);
                }
            }
        }
    });
    
    for (const text of Object.values(texts)) {
        if (text.translate) {
            continue;
        }
        
        const handler = getPoeDbSearchTranslateHandler(text);
        if (!handler) {
            continue;
        }
        
        let searchText = handler.getSearchText(text);
        
        if (searchText) {
            searchText = searchText.replace(replaceCharRegex, (c) => (poeDbReplaceCharMap.get(c) ?? c));
            
            requests.push({
                url: `https://poe2db.tw/tw/${ searchText }`,
                userData: { key: text.key }
            });
        }
        
    }
    
    await crawler.run(requests);
}

await translateByPoeDbAutoComplete();
await translateByPoeDbSearch();

const translates = new Map<string, Set<string>>();

for (const text of Object.values(texts)) {
    if (text.translate) {
        let translateList = translates.get(text.original);
        if (!translateList) {
            translates.set(text.original, translateList = new Set());
        }
        translateList.add(text.translate);
    }
}

for (const text of Object.values(texts)) {
    if (!text.translate) {
        const translateList = translates.get(text.original);
        if (translateList && translateList.size > 0) {
            if (translateList.size === 1) {
                text.translate = translateList.values().next().value;
                console.log("translate by same original", text.original, "=>", text.translate);
            }
            else {
                console.warn("Multiple translates for original:", text.original, "=>", ...translateList.values());
            }
        }
    }
}

writeTexts(Object.values(texts));
