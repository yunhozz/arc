export async function runPostinstall({output=process.stdout}={}){
 output.write('🎉 ARC installed successfully! Run arc to set up the harness.\n');
 return 0;
}
