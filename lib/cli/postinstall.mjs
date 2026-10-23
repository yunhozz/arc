export async function runPostinstall({output=process.stdout}={}){
 output.write('Run arc to install or manage the ARC harness.\n');
 return 0;
}
