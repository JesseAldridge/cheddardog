while [ 1 ]
do
npm run build; npm run refresh
echo 'pulled ETrade transactions, sleeping 24 hours...'
sleep 86400
done
