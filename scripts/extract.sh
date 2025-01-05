for f in `find src -type f | grep .ts$ | grep -v \\\.test.ts`
do
  f1=`echo $f | cut -c 5-`
  f=./$f1
  f2="./dist${f#.}"
  f2="${f2%.ts}.js"


  echo "\"${f%.ts}\": { \"types\": \"${f2%.js}.d.ts\", \"default\": \"$f2\" },"
done
