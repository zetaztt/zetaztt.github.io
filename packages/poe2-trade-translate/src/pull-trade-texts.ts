import { readTexts, type TextData, writeTexts } from "./share.js";

interface ItemBaseConfig {
    type: string;
}

interface ItemUniqueConfig {
    type: string;
    text: string;
    name: string;
    disc?: string;
    
    flags: { unique: true };
}

type ItemConfig = ItemBaseConfig | ItemUniqueConfig

interface StatConfig {
    id: string;
    type: string;
    text: string;
}

interface StaticConfig {
    id: string;
    text: string;
    image?: string;
}

interface FilterConfig {
    id: string;
    option?: {
        options: { id: string | null; text: string }[]
    };
    text?: string;
    fullSpan?: boolean;
    minMax?: boolean;
    halfSpan?: boolean;
    tip?: string;
    image?: string;
    input?: {
        placeholder: string
    };
}

const poe2TwHref = "www.pathofexile.tw";
const poe2Href = "www.pathofexile.com";

const textMap = new Map<string, TextData>();
const wordsMap = new Map<string, string[]>();

function setText(key: string, original: string, translate?: string, options?: {
    needCheck?: boolean,
    muteMultiWarn?: boolean
}) {
    if (!original) {
        return;
    }
    
    const { needCheck, muteMultiWarn } = options ?? {};
    
    if (textMap.has(key)) {
        if (!muteMultiWarn) {
            console.error("Could not set text map for key '" + key + "'");
        }
        return;
    }
    
    textMap.set(key, {
        key,
        original,
        translate,
        needCheck
    });
    
    if (translate) {
        let translates = wordsMap.get(original);
        if (!translates) {
            wordsMap.set(original, translates = []);
        }
        translates.push(translate);
    }
}

async function fetchPoe2TradeData<T>(href: string, type: string): Promise<T> {
    const response = await fetch(`https://${ href }/api/trade2/data/${ type }`, {
        headers: {
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36 Edg/144.0.0.0"
        }
    });
    return response.json();
}

async function fetchItemBasesData(href: string) {
    return fetchPoe2TradeData<{
        result: { id: string, label: string, entries: ItemConfig[] }[]
    }>(href, "items");
}

function isUniqueItem(item: ItemConfig): item is ItemUniqueConfig {
    return Boolean("flags" in item && item.flags.unique);
}

async function processItemTexts() {
    const [data, twData] = await Promise.all([
        fetchItemBasesData(poe2Href),
        fetchItemBasesData(poe2TwHref)
    ]);
    
    for (const group of data.result) {
        const groupTextKey = `items/${ group.id }`;
        
        const twGroup = twData.result.find(g => g.id === group.id);
        
        setText(groupTextKey, group.label, twGroup?.label);
        
        for (const entry of group.entries) {
            if (isUniqueItem(entry)) {
                setText(`${ groupTextKey }/${ entry.name }`, entry.name, "", {
                    muteMultiWarn: true
                });
            }
            
            setText(`${ groupTextKey }/${ entry.type }`, entry.type, "", {
                muteMultiWarn: true
            });
        }
    }
    
}

async function fetchStatsData(href: string) {
    return fetchPoe2TradeData<{
        result: { id: string, label: string, entries: StatConfig[] }[]
    }>(href, "stats");
}

async function processStatsTexts() {
    const [data, twData] = await Promise.all([
        fetchStatsData(poe2Href),
        fetchStatsData(poe2TwHref)
    ]);
    
    for (const group of data.result) {
        const groupTextKey = `stats/${ group.id }`;
        
        const twGroup = twData.result.find(g => g.id === group.id);
        
        setText(groupTextKey, group.label, twGroup?.label);
        
        const statsMap = new Map<string, StatConfig[]>();
        const twStatsMap = new Map<string, StatConfig[]>();
        
        for (const entry of group.entries) {
            let stats = statsMap.get(entry.id);
            if (!stats) {
                statsMap.set(entry.id, stats = []);
            }
            stats.push(entry);
        }
        
        if (twGroup) {
            for (const group of twGroup.entries) {
                let stats = twStatsMap.get(group.id);
                if (!stats) {
                    twStatsMap.set(group.id, stats = []);
                }
                stats.push(group);
            }
        }
        
        for (const [id, stats] of statsMap) {
            const twStats = twStatsMap.get(id);
            for (const [i, stat] of stats.entries()) {
                const entryTextKey = `${ groupTextKey }/${ id }/${ stat.text }`;
                
                const translateText = twStats?.[i]?.text;
                setText(entryTextKey, stat.text, translateText, {
                    needCheck: stats.length > 1
                });
                
            }
        }
    }
}

async function fetchStaticData(href: string) {
    return fetchPoe2TradeData<{
        result: { id: string, label: string, entries: StaticConfig[] }[]
    }>(href, "static");
}

async function processStaticTexts() {
    const [data, twData] = await Promise.all([
        fetchStaticData(poe2Href),
        fetchStaticData(poe2TwHref)
    ]);
    
    for (const group of data.result) {
        const groupTextKey = `static/${ group.id }`;
        
        const twGroup = twData.result.find(g => g.id === group.id);
        
        setText(groupTextKey, group.label, twGroup?.label);
        
        const staticsMap = new Map<string, StaticConfig[]>();
        const twStaticsMap = new Map<string, StaticConfig[]>();
        
        for (const entry of group.entries) {
            let staticConfig = staticsMap.get(entry.id);
            if (!staticConfig) {
                staticsMap.set(entry.id, staticConfig = []);
            }
            staticConfig.push(entry);
        }
        
        if (twGroup) {
            for (const group of twGroup.entries) {
                let staticConfig = twStaticsMap.get(group.id);
                if (!staticConfig) {
                    twStaticsMap.set(group.id, staticConfig = []);
                }
                staticConfig.push(group);
            }
        }
        
        for (const [id, staticConfigs] of staticsMap) {
            const twStaticConfigs = twStaticsMap.get(id);
            for (const [i, staticConfig] of staticConfigs.entries()) {
                if (!staticConfig.text) {
                    continue;
                }
                const entryTextKey = `${ groupTextKey }/${ id }/${ staticConfig.text }`;
                
                const translateText = twStaticConfigs?.[i]?.text;
                setText(entryTextKey, staticConfig.text, translateText, {
                    needCheck: staticConfigs.length > 1
                });
                
            }
        }
    }
}

async function fetchFilterData(href: string) {
    return fetchPoe2TradeData<{
        result: { id: string, title?: string, hide?: boolean, filters: FilterConfig[] }[]
    }>(href, "filters");
}

async function processFilterTexts() {
    const [data, twData] = await Promise.all([
        fetchFilterData(poe2Href),
        fetchFilterData(poe2TwHref)
    ]);
    
    for (const group of data.result) {
        const groupTextKey = `filters/${ group.id }`;
        const twGroup = twData.result.find(g => g.id === group.id);
        if (group.title) {
            setText(groupTextKey, group.title, twGroup?.title);
        }
        for (const entry of group.filters) {
            const entryTextKey = `${ groupTextKey }/${ entry.id }`;
            const twEntry = twGroup?.filters.find(e => e.id === entry.id);
            if (entry.text) {
                setText(entryTextKey, entry.text, twEntry?.text);
            }
            
            if (entry.option) {
                for (const option of entry.option.options) {
                    const optionTextKey = `${ entryTextKey }/${ option.id }`;
                    const twOption = twEntry?.option?.options.find(o => o.id === option.id);
                    setText(optionTextKey, option.text, twOption?.text);
                }
            }
        }
    }
}

function mergeTexts() {
    
    const backendTexts = readTexts();
    
    if (!backendTexts) {
        return;
    }
    
    for (const text of textMap.values()) {
        if (!text.translate) {
            const backendText = backendTexts[text.key];
            if (backendText && backendText.translate) {
                if (backendText.needCheck && text.translate && !text.needCheck) {
                    continue;
                }
                text.translate = backendText.translate;
                text.needCheck = backendText.needCheck;
            }
        }
    }
}

await Promise.all([
    processItemTexts(),
    processStatsTexts(),
    processStaticTexts(),
    processFilterTexts(),
]);

mergeTexts();
writeTexts(Array.from(textMap.values()));

