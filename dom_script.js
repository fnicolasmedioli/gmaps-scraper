(() => {

function clickPlace(n=1)
{
    const placeList = document.querySelectorAll("a[href^='https://www.google.com/maps/place/']");

    if (placeList.length < n)
    {
        console.log(`Didn't find "${n}" element`);
        return;
    }

    placeList[n-1].click();
}

function goBackToPlaceList()
{
    const button = document.getElementById("omnibox-singlebox").children[0].children[0].children[0];
    button.click();        
}

function getPlaceListLength()
{
    const placeList = document.querySelectorAll("a[href^='https://www.google.com/maps/place/']");
    return placeList.length;
}

function loadingPlaces()
{
    const firstPlace = document.querySelector("a[href^='https://www.google.com/maps/place/']");
    const placeListContainer = firstPlace.parentElement.parentElement.parentElement;

    const subElements = placeListContainer.children;
    const last = subElements[subElements.length-1];

    if (last.children.length == 3)
        return true;
    
    return false;
}

function scrollPlaceList()
{
    const firstPlace = document.querySelector("a[href^='https://www.google.com/maps/place/']");
    const placeListContainer = firstPlace.parentElement.parentElement.parentElement;

    placeListContainer.scrollTop = placeListContainer.scrollHeight;
}

function getPlacesID()
{
    const IDRegex = /\w{18}:\w{18}/gi;
    const placeList = document.querySelectorAll("a[href^='https://www.google.com/maps/place/']");
    const idList = []

    if (!placeList) return "[]";

    for (let i = 0; i < placeList.length; i++)
    {
        try {
            const url = placeList[i].getAttribute("href");
            idList.push(url.match(IDRegex)[0]);
        }
        catch {}
    }
    return JSON.stringify(idList);
}

/* CODE_REPLACE */

})();