export async function runChild(...args){return(await import('../management/update.mjs')).runChild(...args);}
