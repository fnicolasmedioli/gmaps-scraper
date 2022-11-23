const axios = require("axios");
const nodeUrl = require("url");
const extractDomain = require("extract-domain");

const SOLO_CONTACT = true;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const notInterestingExtensions = [".gif", ".jpg", ".jpeg", ".css", ".js", ".svg", ".png", ".json"];
const notInterestingPages = ["facebook", "instagram"];

function interestingUrl(url)
{
    const t = url.toLowerCase();
    for (const q of notInterestingPages)
        if (t.includes(q))
            return false;
    return true;
}

function notInterestingExtensionInText(t)
{
    for (const e of notInterestingExtensions)
        if (t.endsWith(e))
            return true;
    return false;
}

function isContactUrl(url)
{
    const t = ["contact", "Contact", "CONTACT", "Contatto", "contatto", "CONTATTO"];
    for (const q of t)
        if (url.includes(q))
            return true;
    return false;
}

function findUrlsInText(s)
{    
    function isInterestingUrl(url)
    {
        for (const extension of notInterestingExtensions)
            if (url.endsWith(extension))
                return false;
        if (SOLO_CONTACT && !isContactUrl(url))
            return false;
        return true;
    }

    const expr = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/gi;

    const regexResult = s.matchAll(expr);
    const subLinksSet = new Set();

    for (let match of regexResult)
    {
        let fullUrl = match[0];
        let withoutParams = fullUrl;

        const t = fullUrl.indexOf("?");
        if (t != -1)
            withoutParams = fullUrl.slice(0, t);

        if (isInterestingUrl(withoutParams))
            subLinksSet.add(withoutParams);
    }

    const urlList = Array(...subLinksSet);

    return urlList;
}

function findEmailsInText(s)
{

    const expr = /['">\s]\b([a-zA-Z0-9\._-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)/gi;

    const regexResult = s.matchAll(expr);
    const emailSet = new Set();
    for (let match of regexResult)
        if (typeof(match) == "object" && match.length > 0)
            if (!notInterestingExtensionInText(match[1]))
                emailSet.add(match[1]);

    return emailSet;
}

async function extractData(url)
{
    let response;
    let html;
    try
    {
        response = (await axios.get(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/107.0.0.0 Safari/537.36"
            },
            timeout: 1000*3
        }));

        html = response?.data;

        if (typeof(html) != "string")
            throw new Error();
    }
    catch (e)
    {
        return Promise.resolve({
            urls: [],
            emails: []
        });
    }
    return Promise.resolve({
        urls: new Set(findUrlsInText(html).filter(
            v => extractDomain(v) == extractDomain(url)
        )),
        emails: findEmailsInText(html)
    });
}

async function findEmails(url)
{
    if (!interestingUrl(url))
        return Promise.resolve([]);

    let { urls, emails } = await extractData(url);

    for (const subUrl of urls)
    {
        const subUrlEmails = (await extractData(subUrl)).emails;
        for (const subEmail of subUrlEmails)
            emails.add(subEmail);
    }

    try
    {
        const t = new nodeUrl.URL(url);
        const urlBase = t.protocol + "//" + t.host + "/";
        if (urlBase != url)
        {
            const baseEmails = (await extractData(urlBase)).emails;
            for (const subEmail of baseEmails)
                emails.add(subEmail);
        }         
    }
    catch {}

    const result = Array(...emails);

    return Promise.resolve(result);
}

exports.findEmails = findEmails;