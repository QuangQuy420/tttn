docker start postgres-user
docker start minio-product

Start-Process powershell -ArgumentList "cd D:\git\tttn\user-service; mvn spring-boot:run"

Start-Process powershell -ArgumentList "cd D:\git\tttn\product-service; npm run start:dev"

Start-Process powershell -ArgumentList "cd D:\git\tttn\api-gateway; npm run start:dev"

Start-Process powershell -ArgumentList "cd D:\git\tttn\web; npm run dev"