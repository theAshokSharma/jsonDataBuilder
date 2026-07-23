sudo mkdir -p /var/www/jsonbuilder
sudo chown $USER:$USER /var/www/jsonbuilder

# Copy your app files into it
cp -r /home/ashoksharma/app/jsonDataBuilder/src/jsonDataBuilder/* /var/www/jsondatabuilder/

# Create the schemas folder (server.js does this too, but good to do upfront)
mkdir -p /var/www/jsonbuilder/schemas

# Install Node dependencies
cd /var/www/jsonbuilder
npm install