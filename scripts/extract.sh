
# for d in `find src -type d$ | grep -v node_modules | grep -v _esm`
# do
# d=`echo $d | cut -c 6-`
# d=./$d
# echo "\"${d}\": { \"import\": { \"types\": \"${d}/index.d.ts\", \"default\": \"./_esm${d#.}/index.mjs\" }, \"require\": \"${d}/index.js\" },"
# done

for f in `find src -type f | grep .ts$ | grep -v .test.ts`
do
f1=`echo $f | cut -c 5-`
f=./$f1
f2="./dist${f#.}"
f2="${f2%.ts}.js"
f3="./_cjs${f2#./dist}"
f3="${f3%.js}.cjs"

if [[ $f1 != "Prelude.code.ts" && $f1 != "Prelude.ts" ]]; then
  echo "\"${f%.ts}\": { \"import\": { \"types\": \"${f2%.js}.d.ts\", \"default\": \"$f2\" }, \"require\": { \"types\": \"${f2%.js}.d.ts\", \"default\": \"${f3}\" } },"
fi

done

# for f in `find src -type f | grep .tsx$ | grep -v index.ts$ | grep -v .d.ts$ | grep -v node_modules`
# do
# f=`echo $f | cut -c 6-`
# f=./$f
# f2="./_esm${f#.}"
# f2="${f2%.tsx}.mjs"
# echo "\"${f%.tsx}\": { \"import\": { \"types\": \"${f%.tsx}.d.ts\", \"default\": \"$f2\" }, \"require\": \"${f%.tsx}.js\" },"
# done
