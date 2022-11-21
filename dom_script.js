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

/* CODE_REPLACE */

})();